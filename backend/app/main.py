"""
Background Remover API — المرحلة الأولى فقط.

تشغيل محلي:
    uvicorn app.main:app --reload --port 8000

نقطة النهاية الوحيدة المطلوبة في هذه المرحلة:
    POST /api/remove-background   (multipart/form-data, field name = "file")
    -> يرجع صورة PNG بخلفية شفافة.
"""
import io
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from . import config
from .pipeline import pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bg_remover.main")

app = FastAPI(
    title="PUBG Character Background Remover",
    description="المرحلة الأولى: استخراج الشخصية وإزالة الخلفية باستخدام SAM2 + BiRefNet",
    version="0.1.0",
)

# في التطوير المحلي فقط. عند النشر (مرحلة لاحقة) يجب تقييد origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/remove-background")
async def remove_background(file: UploadFile = File(...)):
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
        result_png = pipeline.remove_background(raw)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Background removal failed")
        raise HTTPException(status_code=500, detail=f"فشل معالجة الصورة: {exc}") from exc

    return Response(content=result_png, media_type="image/png")
