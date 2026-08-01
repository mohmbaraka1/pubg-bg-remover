"""
Background Remover API — المرحلة الأولى فقط.

تشغيل محلي:
    uvicorn app.main:app --reload --port 8000

نقطة النهاية الوحيدة المطلوبة في هذه المرحلة:
    POST /api/remove-background   (multipart/form-data, field name = "file")
    -> يرجع صورة PNG بخلفية شفافة.
"""
import base64
import io
import logging

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from . import config
from .pipeline import pipeline, slice_grid, slice_grid_by_color

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bg_remover.main")

app = FastAPI(
    title="PUBG Character Background Remover",
    description="المرحلة الأولى: استخراج الشخصية وإزالة الخلفية باستخدام SAM2 + BiRefNet",
    version="0.1.0",
)

# origins تُقرأ من متغيّر البيئة CORS_ALLOWED_ORIGINS وقت النشر (انظر
# config.py) - افتراضياً "*" بالتطوير المحلي لو المتغيّر غير معرّف.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/remove-background")
async def remove_background(
    file: UploadFile = File(...),
    low_thresh: float | None = Form(None),
    high_thresh: float | None = Form(None),
    capture_padding_x: float | None = Form(None),
    capture_padding_y: float | None = Form(None),
    use_black_bg_refine: bool | None = Form(None),
):
    if file.content_type not in config.ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"نوع الملف غير مدعوم: {file.content_type}. "
            f"الأنواع المسموحة: {', '.join(config.ALLOWED_CONTENT_TYPES)}",
        )

    raw = await file.read()
    size_mb = len(raw) / (1024 * 1024)
    if size_mb > config.MAX_UPLOAD_MB:
        raise HTTPException(
            status_code=400,
            detail=f"حجم الملف كبير جداً ({size_mb:.1f}MB). الحد الأقصى {config.MAX_UPLOAD_MB}MB.",
        )

    try:
        result_png = pipeline.remove_background(
            raw,
            low_thresh=low_thresh,
            high_thresh=high_thresh,
            capture_padding_x=capture_padding_x,
            capture_padding_y=capture_padding_y,
            use_black_bg_refine=use_black_bg_refine,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Background removal failed")
        raise HTTPException(status_code=500, detail=f"فشل معالجة الصورة: {exc}") from exc

    return Response(content=result_png, media_type="image/png")


@app.post("/api/detect-full-layout")
async def detect_full_layout(file: UploadFile = File(...)):
    """
    يكتشف كل شي بصورة مرجعية بضغطة وحدة: مواضع الشخصيات + شبكات
    الأسلحة/السيارات فوق وتحت - لبناء تيمبلت شامل تلقائياً.
    """
    raw = await file.read()
    try:
        result = pipeline.detect_full_template_layout(raw)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Detect full layout failed")
        raise HTTPException(status_code=500, detail=f"فشل الكشف: {exc}") from exc
    return result


@app.post("/api/detect-people")
async def detect_people(file: UploadFile = File(...)):
    """
    يكتشف صناديق كل الأشخاص بصورة مرجعية بالذكاء الاصطناعي (سريعة، بدون قص)
    - يُستخدم لبناء تيمبلت مطابق تلقائياً لمواضع الشخصيات الحقيقية.
    """
    raw = await file.read()
    try:
        result = pipeline.detect_people_boxes(raw)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Detect people failed")
        raise HTTPException(status_code=500, detail=f"فشل الكشف: {exc}") from exc
    return result


@app.post("/api/upscale")
async def upscale(file: UploadFile = File(...)):
    """
    يكبّر صورة PNG بخلفية شفافة (مثل نتيجة Grid Extractor) بالذكاء الاصطناعي
    (FSRCNN، مقياس x4) للحصول على دقة أعلى (تقارب 4K حسب الحجم الأصلي).
    """
    raw = await file.read()
    try:
        result_png = pipeline.upscale_image(raw)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Upscale failed")
        raise HTTPException(status_code=500, detail=f"فشل التكبير: {exc}") from exc

    return Response(content=result_png, media_type="image/png")


@app.post("/api/remove-background/prepare")
async def prepare_tuning(file: UploadFile = File(...)):
    """
    يشغّل المرحلة الثقيلة فقط (كشف + BiRefNet) مرة واحدة، ويرجّع session_id
    يُستخدم بعدها مع /tune للتجربة السريعة لإعدادات مختلفة على نفس الصورة.
    """
    if file.content_type not in config.ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="نوع الملف غير مدعوم.")

    raw = await file.read()
    try:
        session_id = pipeline.prepare_tuning_session(raw)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Prepare tuning session failed")
        raise HTTPException(status_code=500, detail=f"فشل التحضير: {exc}") from exc

    return {"session_id": session_id}


@app.post("/api/remove-background/tune")
async def tune_background(
    session_id: str = Form(...),
    low_thresh: float = Form(0.28),
    high_thresh: float = Form(0.60),
    capture_padding_x: float = Form(0.40),
    capture_padding_y: float = Form(0.15),
):
    """
    تعديل سريع (ثوانٍ) على جلسة مُحضَّرة مسبقاً - لا يعيد تشغيل YOLO أو
    BiRefNet، فقط يطبّق الإعدادات الجديدة على النتائج المخزَّنة.
    """
    try:
        result_png = pipeline.tune_combine(
            session_id,
            low_thresh=low_thresh,
            high_thresh=high_thresh,
            pad_x_ratio=capture_padding_x,
            pad_y_ratio=capture_padding_y,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tune combine failed")
        raise HTTPException(status_code=500, detail=f"فشل التعديل: {exc}") from exc

    return Response(content=result_png, media_type="image/png")


@app.post("/api/remove-background-multi")
async def remove_background_multi(file: UploadFile = File(...)):
    """
    يستقبل صورة فيها عدة شخصيات (مثل صور اصطفاف الحسابات)، ويكتشف كل واحدة
    فيها، ويرجّع كل شخصية كصورة PNG مستقلة بخلفية شفافة (Base64).
    """
    if file.content_type not in config.ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"نوع الملف غير مدعوم: {file.content_type}. "
            f"الأنواع المسموحة: {', '.join(config.ALLOWED_CONTENT_TYPES)}",
        )

    raw = await file.read()
    size_mb = len(raw) / (1024 * 1024)
    if size_mb > config.MAX_UPLOAD_MB:
        raise HTTPException(
            status_code=400,
            detail=f"حجم الملف كبير جداً ({size_mb:.1f}MB). الحد الأقصى {config.MAX_UPLOAD_MB}MB.",
        )

    try:
        results = pipeline.remove_background_multi(raw)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Multi-character background removal failed")
        raise HTTPException(status_code=500, detail=f"فشل استخراج الشخصيات: {exc}") from exc

    return {
        "count": len(results),
        "images": [base64.b64encode(r).decode("utf-8") for r in results],
    }


@app.post("/api/grid-slice")
async def grid_slice(
    file: UploadFile = File(...),
    rect_x: int = Form(...),
    rect_y: int = Form(...),
    rect_w: int = Form(...),
    rect_h: int = Form(...),
    saturation_threshold: float = Form(70.0),
    method: str = Form("projection"),
):
    """
    يستقبل صورة سكرين شوت + منطقة تقريبية (rect) تحدد مكان الشبكة، ويكتشف
    تلقائياً حدود كل بطاقة/عنصر داخلها ويقصّها بدقة. لا يستخدم SAM2/BiRefNet
    (معالجة سريعة، ثوانٍ فقط، لأنها تحليل هندسي/لوني بسيط).

    method="projection" (افتراضي): تحليل خطي بالتشبع (أدق للشبكات المنتظمة).
    method="color": اكتشاف بألوان إطارات البطاقات + Contours (أدق أحياناً
    للبطاقات ذات إطار ملوّن واضح، لكن قد تفوّته بطاقات بلا إطار ملوّن).
    """
    raw = await file.read()
    try:
        if method == "color":
            cells = slice_grid_by_color(raw, rect_x, rect_y, rect_w, rect_h)
        else:
            cells = slice_grid(raw, rect_x, rect_y, rect_w, rect_h, saturation_threshold)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Grid slicing failed")
        raise HTTPException(status_code=500, detail=f"فشل تقطيع الشبكة: {exc}") from exc

    return {
        "cells": [
            {
                "row": c["row"],
                "col": c["col"],
                "image_base64": base64.b64encode(c["png_bytes"]).decode("utf-8"),
            }
            for c in cells
        ]
    }


@app.post("/api/extract-cutout")
async def extract_cutout(
    file: UploadFile = File(...),
    rect_x: int = Form(...),
    rect_y: int = Form(...),
    rect_w: int = Form(...),
    rect_h: int = Form(...),
):
    """
    يقص منطقة محددة يدوياً (إطار، شعار/هاشتاق...) ويفرغها من خلفيتها
    الفوتوغرافية بـ BiRefNet لوحده (بدون YOLO/SAM2 - انظر توثيق
    extract_salient_cutout بـ pipeline.py). مناسب للعناصر المرسومة مباشرة
    فوق خلفية الصورة، لا لأيقونات لها بطاقة لون خاصة (تلك تُقص عادي فقط،
    استخدم /api/grid-slice).
    """
    raw = await file.read()
    try:
        png_bytes = pipeline.extract_salient_cutout(raw, rect_x, rect_y, rect_w, rect_h)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Salient cutout extraction failed")
        raise HTTPException(status_code=500, detail=f"فشل تفريغ العنصر: {exc}") from exc

    return Response(content=png_bytes, media_type="image/png")
