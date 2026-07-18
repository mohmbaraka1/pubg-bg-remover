"""
خط الأنابيب الكامل لاستخراج الشخصية من سكرين شوت PUBG Mobile وإزالة الخلفية.

المراحل:
  1) YOLOv8  -> يكتشف كل الأشخاص في الصورة، ويختار "الشخصية الرئيسية"
               (الأكبر مساحة والأقرب لمركز الصورة - هذا هو نمط شاشات PUBG
               حيث الشخصية تكون بارزة في المنتصف/الأسفل).
  2) SAM2    -> يأخذ صندوق (bounding box) الشخصية المختارة كـ prompt وينتج
               قناع (mask) دقيق للجسم كامل (من الرأس للقدم) + أي سلاح ملتصق بها.
  3) BiRefNet -> يُنعّم حواف القناع ويستخرج تفاصيل دقيقة جداً (خصلات شعر،
               حواف الملابس، حواف السلاح) على كامل الصورة، ثم يُدمج مع قناع
               SAM2 لضمان أن الحدود صحيحة تشريحياً وليست "تخمين" بصري بحت.
  4) التركيب النهائي -> قناع alpha عالي الجودة يُطبَّق على الصورة الأصلية
               وتُصدَّر PNG بخلفية شفافة بالكامل.

لا يوجد أي Crop ثابت ولا حل تجريبي: كل خطوة تعتمد على نموذج مدرَّب فعلياً.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path
from urllib.request import urlretrieve

import cv2
import numpy as np
import torch
from PIL import Image

from . import config

logger = logging.getLogger("bg_remover.pipeline")


def _resolve_device() -> str:
    if config.DEVICE != "auto":
        return config.DEVICE
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():  # Apple Silicon
        return "mps"
    return "cpu"


@dataclass
class PersonBox:
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float


class BackgroundRemovalPipeline:
    """
    يُحمَّل مرة واحدة عند إقلاع السيرفر (انظر main.py -> lifespan) ثم يُعاد
    استخدامه لكل طلب، لأن تحميل الأوزان من جديد لكل صورة مكلف جداً.
    """

    def __init__(self) -> None:
        self.device = _resolve_device()
        logger.info("Using device: %s", self.device)

        self._yolo = None
        self._sam2_predictor = None
        self._birefnet = None
        self._birefnet_transform = None

    # ------------------------------------------------------------------ #
    # تحميل النماذج (Lazy load - أول طلب فقط)
    # ------------------------------------------------------------------ #
    def load_all(self) -> None:
        self._load_yolo()
        self._load_sam2()
        self._load_birefnet()
        logger.info("All models loaded successfully.")

    def _load_yolo(self) -> None:
        if self._yolo is not None:
            return
        from ultralytics import YOLO

        logger.info("Loading YOLO (%s) for main-character detection...", config.YOLO_MODEL_ID)
        self._yolo = YOLO(config.YOLO_MODEL_ID)

    def _load_sam2(self) -> None:
        if self._sam2_predictor is not None:
            return
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        if not config.SAM2_CHECKPOINT_PATH.exists():
            logger.info("Downloading SAM2 checkpoint (first run only)...")
            config.SAM2_CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
            urlretrieve(config.SAM2_CHECKPOINT_URL, config.SAM2_CHECKPOINT_PATH)

        logger.info("Loading SAM2 model...")
        sam2_model = build_sam2(
            config.SAM2_MODEL_CFG,
            str(config.SAM2_CHECKPOINT_PATH),
            device=self.device,
        )
        self._sam2_predictor = SAM2ImagePredictor(sam2_model)

    def _load_birefnet(self) -> None:
        if self._birefnet is not None:
            return
        from torchvision import transforms
        from transformers import AutoModelForImageSegmentation

        logger.info("Loading BiRefNet (%s)...", config.BIREFNET_MODEL_ID)
        model = AutoModelForImageSegmentation.from_pretrained(
            config.BIREFNET_MODEL_ID, trust_remote_code=True
        )
        model.to(self.device)
        model.eval()
        if self.device == "cuda":
            model.half()
        self._birefnet = model

        self._birefnet_transform = transforms.Compose(
            [
                transforms.Resize(config.BIREFNET_INPUT_SIZE),
                transforms.ToTensor(),
                transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
            ]
        )

    # ------------------------------------------------------------------ #
    # خطوة 1: تحديد الشخصية الرئيسية
    # ------------------------------------------------------------------ #
    def _detect_main_character(self, image_bgr: np.ndarray) -> PersonBox:
        h, w = image_bgr.shape[:2]
        results = self._yolo.predict(
            image_bgr,
            classes=[config.YOLO_PERSON_CLASS_ID],
            conf=config.YOLO_CONF_THRESHOLD,
            verbose=False,
        )

        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            # لا يوجد شخص مكتشف بثقة كافية -> نفترض أن الشخصية تشغل مركز
            # الصورة تقريباً (حالة نادرة، لكن نتجنب فشل الطلب بالكامل).
            logger.warning("No person detected by YOLO; falling back to full-frame box.")
            return PersonBox(x1=0, y1=0, x2=w, y2=h, confidence=0.0)

        cx, cy = w / 2, h / 2
        best_score = -1.0
        best_box: PersonBox | None = None

        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            area = (x2 - x1) * (y2 - y1)
            box_cx, box_cy = (x1 + x2) / 2, (y1 + y2) / 2
            # مسافة طبيعية عن المركز (كلما اقتربت زاد النقاط)
            dist = ((box_cx - cx) ** 2 + (box_cy - cy) ** 2) ** 0.5
            max_dist = ((w / 2) ** 2 + (h / 2) ** 2) ** 0.5
            centrality = 1.0 - (dist / max_dist)
            area_ratio = area / (w * h)

            # الشخصية الرئيسية في PUBG غالباً هي الأكبر والأقرب للمنتصف
            score = (0.6 * area_ratio) + (0.3 * centrality) + (0.1 * conf)
            if score > best_score:
                best_score = score
                best_box = PersonBox(int(x1), int(y1), int(x2), int(y2), conf)

        assert best_box is not None
        return best_box

    # ------------------------------------------------------------------ #
    # خطوة 2: SAM2 - قناع دقيق من الرأس حتى القدم
    # ------------------------------------------------------------------ #
    def _segment_with_sam2(self, image_rgb: np.ndarray, box: PersonBox) -> np.ndarray:
        self._sam2_predictor.set_image(image_rgb)

        # نوسّع الصندوق بهامش أكبر بكثير من قبل: صندوق كشف YOLO يحيط بالجسم
        # فقط وغالباً "يقص" السلاح الممتد للأمام/للجانب (وضعيات التصويب في
        # PUBG). هامش 6% كان غير كافٍ؛ نستخدم هامش أكبر أفقياً (السلاح عادة
        # يمتد أفقياً) وهامش رأسي معقول لالتقاط الشعر المرتفع/القدم بالكامل.
        h, w = image_rgb.shape[:2]
        box_w, box_h = (box.x2 - box.x1), (box.y2 - box.y1)
        pad_x = int(box_w * 0.40)
        pad_y = int(box_h * 0.15)
        input_box = np.array(
            [
                max(0, box.x1 - pad_x),
                max(0, box.y1 - pad_y),
                min(w, box.x2 + pad_x),
                min(h, box.y2 + pad_y),
            ]
        )

        masks, scores, _ = self._sam2_predictor.predict(
            box=input_box[None, :],
            multimask_output=True,
        )
        # لا نختار بالضرورة أعلى "score" فقط: أحياناً القناع الأعلى ثقة هو
        # الأصغر (لأنه "أنظف" حدودياً) لكنه يقص السلاح. نفضّل من بين أفضل
        # قناعين القناع الأكبر مساحة طالما ثقته قريبة من الأعلى (يدل على
        # أنه يشمل السلاح/أطراف إضافية وليس ضجيجاً).
        order = np.argsort(scores)[::-1]  # من الأعلى ثقة للأقل
        top_idx = order[0]
        best_idx = top_idx
        top_score = scores[top_idx]
        for idx in order[:3]:
            if scores[idx] >= top_score - 0.05:
                if masks[idx].sum() > masks[best_idx].sum():
                    best_idx = idx

        mask = masks[best_idx].astype(np.uint8) * 255
        return mask

    # ------------------------------------------------------------------ #
    # خطوة 3: BiRefNet - تنعيم الحواف والتفاصيل الدقيقة
    # ------------------------------------------------------------------ #
    def _matte_with_birefnet(self, image_pil: Image.Image) -> np.ndarray:
        orig_w, orig_h = image_pil.size
        tensor = self._birefnet_transform(image_pil.convert("RGB")).unsqueeze(0).to(self.device)
        if self.device == "cuda":
            tensor = tensor.half()

        with torch.no_grad():
            preds = self._birefnet(tensor)
            pred = preds[-1] if isinstance(preds, (list, tuple)) else preds
            pred = pred.sigmoid().float().cpu()

        pred = pred[0].squeeze()
        alpha = pred.numpy()
        alpha = cv2.resize(alpha, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
        alpha = (alpha * 255).clip(0, 255).astype(np.uint8)
        return alpha

    # ------------------------------------------------------------------ #
    # دمج القناعين: SAM2 يضبط "أين الشخصية" (تشريحياً/موضعياً بدقة عالية)
    # و BiRefNet يضبط "جودة الحافة" (شعر، تفاصيل دقيقة).
    # ------------------------------------------------------------------ #
    @staticmethod
    def _combine_masks(sam2_mask: np.ndarray, birefnet_alpha: np.ndarray) -> np.ndarray:
        sam2_norm = sam2_mask.astype(np.float32) / 255.0
        biref_norm = birefnet_alpha.astype(np.float32) / 255.0

        # نوسّع قليلاً قناع SAM2 كمنطقة "سماح" لتفاصيل BiRefNet الدقيقة
        # (شعر، أطراف سلاح رفيعة) التي قد تكون خارج حدود SAM2 الدقيقة قليلاً.
        kernel = np.ones((11, 11), np.uint8)
        sam2_dilated = cv2.dilate((sam2_norm * 255).astype(np.uint8), kernel, iterations=1)
        sam2_dilated = sam2_dilated.astype(np.float32) / 255.0

        combined = biref_norm * sam2_dilated

        # === تنظيف بقايا الشفافية الجزئية (halo) حول الحواف ===
        # المشكلة السابقة: قيم alpha منخفضة (10-40 من 255) كانت تُترك كما
        # هي، فتظهر كـ"ضبابية" خفيفة من الخلفية القديمة حول الشخصية.
        # نطبّق منحنى تباين (contrast curve) على alpha: يدفع القيم الواطئة
        # جداً نحو الصفر تماماً، والقيم العالية جداً نحو 1، بينما يحافظ على
        # التدرّج الطبيعي لخصلات الشعر وحواف السلاح شبه الشفافة فعلياً.
        low_thresh, high_thresh = 0.28, 0.60
        combined = np.clip((combined - low_thresh) / (high_thresh - low_thresh), 0.0, 1.0)

        # إغلاق مورفولوجي خفيف يسدّ أي ثقوب صغيرة داخل الشخصية (مثلاً وسط
        # السلاح أو بين الأصابع) نتجت عن القص الحاد بالخطوة السابقة.
        closing_kernel = np.ones((5, 5), np.uint8)
        combined_u8 = (combined * 255).astype(np.uint8)
        combined_u8 = cv2.morphologyEx(combined_u8, cv2.MORPH_CLOSE, closing_kernel)

        # تنعيم نهائي خفيف جداً للحواف (anti-aliasing) بدون فقدان التفاصيل
        alpha = cv2.GaussianBlur(combined_u8, (3, 3), 0)
        return alpha.clip(0, 255).astype(np.uint8)

    @staticmethod
    def _remove_disconnected_objects(alpha: np.ndarray, box: PersonBox) -> np.ndarray:
        """
        التوسيع الكبير لصندوق الالتقاط (يلتقط السلاح) أحياناً "يلتقط" معه
        كائنات خلفية منفصلة تماماً عن الشخصية (سيارة، شخص آخر جزئي...)
        إذا كانت قريبة بصرياً. هنا نحلل "المكونات المتصلة" (connected
        components) في القناع النهائي، ونحافظ فقط على المكوّن (أو المكوّنات
        المتصلة به فعلياً، مثل السلاح الملتصق باليد) الذي يغطي مركز صندوق
        الشخصية الأصلي من YOLO — أي كائن منفصل تماماً (بلا تلامس بكسل واحد
        مع جسم الشخصية) يُعتبر ضجيجاً ويُحذف.
        """
        binary = (alpha > 25).astype(np.uint8)
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)

        if num_labels <= 1:
            return alpha  # لا يوجد أي محتوى غير الخلفية أصلاً

        # مركز صندوق الشخصية الأصلي (غير الموسّع) هو أوثق نقطة لمعرفة
        # "أين الشخصية فعلياً" بمعزل عن هامش الالتقاط الكبير.
        cx = (box.x1 + box.x2) // 2
        cy = (box.y1 + box.y2) // 2
        cx = min(max(cx, 0), labels.shape[1] - 1)
        cy = min(max(cy, 0), labels.shape[0] - 1)

        main_label = labels[cy, cx]
        if main_label == 0:
            # المركز وقع خارج أي مكوّن (نادر) -> نأخذ أكبر مكوّن كبديل آمن
            main_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))

        keep_mask = (labels == main_label).astype(np.uint8)
        cleaned_alpha = alpha * keep_mask
        return cleaned_alpha
    def remove_background(self, image_bytes: bytes) -> bytes:
        self.load_all()

        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_rgb = np.array(image_pil)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        box = self._detect_main_character(image_bgr)
        sam2_mask = self._segment_with_sam2(image_rgb, box)
        birefnet_alpha = self._matte_with_birefnet(image_pil)
        final_alpha = self._combine_masks(sam2_mask, birefnet_alpha)
        final_alpha = self._remove_disconnected_objects(final_alpha, box)

        rgba = np.dstack([image_rgb, final_alpha])
        result_img = Image.fromarray(rgba, mode="RGBA")

        # نقصّ الصورة تلقائياً على حدود المحتوى الفعلي (bounding box للـ alpha)
        # لتقليل حجم الملف - هذا ليس "Crop ثابت" بل قص تلقائي بناءً على القناع الناتج.
        bbox = result_img.getbbox()
        if bbox:
            result_img = result_img.crop(bbox)

        out = io.BytesIO()
        result_img.save(out, format="PNG")
        return out.getvalue()


# مثيل واحد (Singleton) يُعاد استخدامه عبر كل الطلبات
pipeline = BackgroundRemovalPipeline()