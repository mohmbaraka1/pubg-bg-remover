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
        self._fsrcnn = None

        # ذاكرة مؤقتة: تحفظ نتيجة المرحلة الثقيلة (كشف + BiRefNet) لكل صورة
        # حتى نقدر نجرب إعدادات مختلفة (عتبات/هوامش) بسرعة (ثوانٍ) بدل
        # إعادة تشغيل النماذج الثقيلة كاملة من الصفر بكل تجربة.
        self._tuning_cache: dict[str, dict] = {}
        self._last_embedded_session: str | None = None

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

    def _load_fsrcnn(self) -> None:
        if self._fsrcnn is not None:
            return
        if not config.FSRCNN_MODEL_PATH.exists():
            logger.info("Downloading FSRCNN super-resolution model (first run only)...")
            config.FSRCNN_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
            urlretrieve(config.FSRCNN_MODEL_URL, config.FSRCNN_MODEL_PATH)

        logger.info("Loading FSRCNN super-resolution model...")
        sr = cv2.dnn_superres.DnnSuperResImpl_create()
        sr.readModel(str(config.FSRCNN_MODEL_PATH))
        sr.setModel("fsrcnn", config.FSRCNN_SCALE)
        self._fsrcnn = sr

    def upscale_image(self, image_bytes: bytes) -> bytes:
        """
        يكبّر صورة PNG (بخلفية شفافة) بالذكاء الاصطناعي (FSRCNN) بمقياس x4،
        مع الحفاظ على الشفافية (القناة الرابعة alpha تُكبَّر بطريقة عادية
        منفصلة، لأن نموذج FSRCNN يشتغل فقط على 3 قنوات ألوان RGB).
        """
        self._load_fsrcnn()

        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        rgba = np.array(image)
        rgb = rgba[:, :, :3]
        alpha = rgba[:, :, 3]

        rgb_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        upscaled_bgr = self._fsrcnn.upsample(rgb_bgr)
        upscaled_rgb = cv2.cvtColor(upscaled_bgr, cv2.COLOR_BGR2RGB)

        new_h, new_w = upscaled_rgb.shape[:2]
        upscaled_alpha = cv2.resize(alpha, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        result_rgba = np.dstack([upscaled_rgb, upscaled_alpha])
        result_img = Image.fromarray(result_rgba, mode="RGBA")

        out = io.BytesIO()
        result_img.save(out, format="PNG")
        return out.getvalue()

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

        # === حماية من الكشف الخاطئ (أيقونة صغيرة بدل الشخصية الفعلية) ===
        # لو الصندوق الأفضل صغير جداً مقارنة بالصورة كاملة (أقل من 3%)،
        # الأرجح إنه كشف خاطئ (أيقونة جانبية، صورة مصغّرة...) مو الشخصية
        # الحقيقية - نتجاهله ونرجع للصورة كاملة كصندوق احتياطي بدل ما نثق
        # بمكان غلط تماماً (كان يسبب نتيجة فاضية بالكامل).
        best_area_ratio = ((best_box.x2 - best_box.x1) * (best_box.y2 - best_box.y1)) / (w * h)
        if best_area_ratio < 0.03:
            logger.warning(
                "الصندوق المكتشف صغير جداً (نسبة %.3f) - يُرجَّح كشف خاطئ، الرجوع للصورة كاملة",
                best_area_ratio,
            )
            return PersonBox(x1=0, y1=0, x2=w, y2=h, confidence=0.0)

        return best_box

    # ------------------------------------------------------------------ #
    # خطوة 2: SAM2 - قناع دقيق من الرأس حتى القدم
    # ------------------------------------------------------------------ #
    def _segment_with_sam2(
        self,
        image_rgb: np.ndarray,
        box: PersonBox,
        x_bound_min: int | None = None,
        x_bound_max: int | None = None,
        pad_x_ratio: float | None = None,
        pad_y_ratio: float | None = None,
    ) -> np.ndarray:
        # ملاحظة: نفترض أن self._sam2_predictor.set_image() استُدعي مسبقاً
        # من قِبل المستدعي (مرة واحدة فقط لكل صورة، لأنه العملية الأغلى) -
        # هذا يسمح باستخراج عدة شخصيات من نفس الصورة بكفاءة عالية.

        # نوسّع الصندوق بهامش أكبر بكثير من قبل: صندوق كشف YOLO يحيط بالجسم
        # فقط وغالباً "يقص" السلاح الممتد للأمام/للجانب (وضعيات التصويب في
        # PUBG). هامش 6% كان غير كافٍ؛ نستخدم هامش أكبر أفقياً (السلاح عادة
        # يمتد أفقياً) وهامش رأسي معقول لالتقاط الشعر المرتفع/القدم بالكامل.
        h, w = image_rgb.shape[:2]
        box_w, box_h = (box.x2 - box.x1), (box.y2 - box.y1)
        pad_x = int(box_w * (pad_x_ratio if pad_x_ratio is not None else 0.40))
        pad_y = int(box_h * (pad_y_ratio if pad_y_ratio is not None else 0.15))
        left = max(0, box.x1 - pad_x)
        right = min(w, box.x2 + pad_x)
        # لو انكشف حد جانبي (منتصف المسافة بينها وبين الجار)، لا نتعداه
        # أبداً - يمنع اختلاط قناع هذي الشخصية بقناع جارتها بصور الاصطفاف
        if x_bound_min is not None:
            left = max(left, x_bound_min)
        if x_bound_max is not None:
            right = min(right, x_bound_max)
        input_box = np.array(
            [
                left,
                max(0, box.y1 - pad_y),
                right,
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
    def _combine_masks(
        sam2_mask: np.ndarray,
        birefnet_alpha: np.ndarray,
        low_thresh: float = 0.28,
        high_thresh: float = 0.60,
    ) -> np.ndarray:
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
        low_thresh, high_thresh = low_thresh, high_thresh
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

        # إغلاق مورفولوجي: يسدّ الثغرات الرفيعة (رقبة، معصم ماسك السلاح،
        # كاحل) الناتجة عن ضعف قيمة alpha بمناطق التماس بين أجزاء الجسم
        # المختلفة، خصوصاً بصور الاصطفاف المزدحمة. القيمة معتدلة عمداً حتى
        # لا تربط شخصية بجارتها المجاورة (المسافة بينهم أكبر بكثير عادة).
        closing_kernel = np.ones((25, 25), np.uint8)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, closing_kernel)

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

    @staticmethod
    def _panel_color_mask(region_bgr: np.ndarray) -> np.ndarray:
        """قناع ثنائي يحدد بكسلات "خلفية بطاقة اللعبة" (نفس اللون الموحّد
        الأحمر/الموف الغامق المستخدم لكل خانات الأسلحة/السيارات/الشارات بغض
        النظر عن الندرة) - مؤشر أوثق من ألوان حدود الندرة المتغيّرة، ويشمل
        درجات إضاءة داكنة (V من 15) كانت تُقطَع سابقاً بعتبة أعلى فتُفقد بها
        خلايا كاملة."""
        hsv = cv2.cvtColor(region_bgr, cv2.COLOR_BGR2HSV)
        h_, s_, v_ = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
        mask = (((h_ >= 140) & (h_ <= 180)) | (h_ <= 10)) & (s_ > 60) & (v_ >= 15) & (v_ <= 150)
        return (mask.astype(np.uint8)) * 255

    @staticmethod
    def _segments_from_absolute_gaps(
        profile: np.ndarray, gap_frac: float, min_seg: int = 15
    ) -> list[tuple[int, int]]:
        """يقسّم profile (كثافة القناع لكل عمود/صف) لمقاطع، حيث الفجوة
        الحقيقية بين الخلايا تهبط قريباً من الصفر - على عكس التغيّر الطبيعي
        داخل رسمة الأيقونة نفسها اللي يبقى أعلى بكثير من عتبة الفجوة، فما
        يتسبب بتقطيع خاطئ داخل نفس الخلية (المشكلة اللي كانت بالعتبة النسبية
        السابقة القائمة على نافذة محلية)."""
        if profile.size == 0 or float(profile.max()) <= 0:
            return []
        threshold = float(profile.max()) * gap_frac
        is_gap = profile < threshold
        segments: list[tuple[int, int]] = []
        start = None
        for i, gap in enumerate(is_gap):
            if not gap and start is None:
                start = i
            elif gap and start is not None:
                if i - start >= min_seg:
                    segments.append((start, i))
                start = None
        if start is not None and len(profile) - start >= min_seg:
            segments.append((start, len(profile)))
        return segments

    def _detect_grid_cell_boxes(self, region_bgr: np.ndarray) -> list[tuple]:
        """يرجّع صناديق (x, y, w, h, block_index) نسبية للمنطقة المعطاة.

        بدل معاملة المنطقة كشبكة واحدة (كان يخلط أسلحة مع سيارات مع شارات
        بنوع واحد ويكسر المحاذاة لو فيها أكثر من مجموعة أعمدة)، نقسّمها أولاً
        لمجموعات أعمدة منفصلة فعلياً (كل مجموعة = صندوق أسلحة، صندوق سيارات...)
        بالاعتماد على فجوات حقيقية بينها، ثم نكتشف صفوف/أعمدة كل مجموعة على
        حدة. صفوف كل المجموعات بنفس الشريط الأفقي عادة تشترك بنفس الإيقاع
        الرأسي، فنكتشفها مرة وحدة من القناع الكامل (إشارة أوضح بكثير، لأنها
        تجمع كل الأيقونات بدل الاعتماد على مجموعة وحدة قد تكون قليلة العناصر).
        أي مجموعة تُنتج أعمدة متفاوتة الحجم بشكل غير منطقي (محتوى غير منتظم
        زي شارات/نصوص مو شبكة عناصر حقيقية) تُرفض بالكامل بدل ما تُرجع صناديق
        غلط - أفضل نتجاهل منطقة غير واضحة من نعطي مواضع خاطئة."""
        rh, rw = region_bgr.shape[:2]
        if rh < 20 or rw < 20:
            return []

        mask = self._panel_color_mask(region_bgr)

        close_kernel = np.ones((9, 25), np.uint8)
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        blocks = []
        min_block_area = max(2000, (rw * rh) // 200)
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            if cw * ch > min_block_area:
                blocks.append((x, y, cw, ch))
        if not blocks:
            return []
        blocks.sort(key=lambda b: b[0])

        global_row_profile = mask.sum(axis=1).astype(float)
        global_row_segs = self._segments_from_absolute_gaps(global_row_profile, gap_frac=0.35)

        all_cells: list[tuple] = []
        for block_idx, (bx, by, bw, bh) in enumerate(blocks):
            block_mask = mask[by:by + bh, bx:bx + bw]
            col_profile = block_mask.sum(axis=0).astype(float)
            col_segs = self._segments_from_absolute_gaps(col_profile, gap_frac=0.22)
            if not col_segs:
                continue

            row_segs = [(max(0, ry1 - by), min(bh, ry2 - by)) for (ry1, ry2) in global_row_segs]
            row_segs = [(a, b) for (a, b) in row_segs if b - a > 10]
            if not row_segs:
                continue

            # فحص انتظام: خلايا شبكة العناصر الحقيقية متقاربة الحجم. تفاوت
            # كبير (شارات/نصوص مختلطة، مو شبكة) يعني المحتوى غير منتظم فنتجاهل
            # هذي المجموعة كاملة بدل ما نطلع صناديق مو دقيقة
            col_widths = [b - a for a, b in col_segs]
            if max(col_widths) > min(col_widths) * 2.2:
                continue

            for (ry1, ry2) in row_segs:
                for (cx1, cx2) in col_segs:
                    all_cells.append((bx + cx1, by + ry1, cx2 - cx1, ry2 - ry1, block_idx))

        all_cells.sort(key=lambda b: (b[4], round(b[1] / 40), b[0]))
        return all_cells

    def detect_full_template_layout(self, image_bytes: bytes) -> dict:
        """
        يكتشف تلقائياً بضغطة وحدة: مواضع كل الشخصيات (YOLO) + شبكات
        الأسلحة/السيارات فوق وتحت صف الشخصيات (تحليل ألوان البطاقات) -
        لبناء تيمبلت شامل مطابق للصورة المرجعية بأقل تدخل يدوي.
        """
        # يحتاج YOLO فقط (كشف أشخاص) + تحليل ألوان بحت - لا داعي لتحميل
        # SAM2/BiRefNet الثقيلة هنا إطلاقاً (كانت تُحمَّل بلا فائدة وتبطئ
        # أول استدعاء لهذا الزر بلا داعي)
        self._load_yolo()
        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_rgb = np.array(image_pil)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        h, w = image_bgr.shape[:2]

        # نبني "صف الشخصيات" الموحّد (الصف الرئيسي فقط، بارتفاع/خط أرض
        # متسقين) بدل إرجاع كل صناديق YOLO الخام كما هي - انظر توثيق
        # _build_character_row لسبب هذا التوحيد
        char_boxes_raw = self._detect_all_characters(image_bgr)
        char_boxes = self._build_character_row(char_boxes_raw)
        characters = [
            {"x1": b.x1, "y1": b.y1, "x2": b.x2, "y2": b.y2} for b in char_boxes
        ]

        if char_boxes:
            char_top = min(b.y1 for b in char_boxes)
            char_bottom = max(b.y2 for b in char_boxes)
        else:
            char_top, char_bottom = h, h  # ما فيه شخصيات - نعتبر كل الصورة "فوق"

        top_region = image_bgr[0:char_top, :]
        top_boxes = self._detect_grid_cell_boxes(top_region)
        top_cells = [
            {"x": x, "y": y, "w": cw, "h": ch, "block": blk} for (x, y, cw, ch, blk) in top_boxes
        ]

        bottom_region = image_bgr[char_bottom:h, :]
        bottom_boxes = self._detect_grid_cell_boxes(bottom_region)
        bottom_cells = [
            {"x": x, "y": y + char_bottom, "w": cw, "h": ch, "block": blk}
            for (x, y, cw, ch, blk) in bottom_boxes
        ]

        return {
            "image_width": w,
            "image_height": h,
            "characters": characters,
            "top_cells": top_cells,
            "bottom_cells": bottom_cells,
        }

    def detect_people_boxes(self, image_bytes: bytes) -> dict:
        """
        يكتشف صناديق كل الأشخاص بالصورة بالذكاء الاصطناعي (YOLO) فقط - بدون
        قص أو إزالة خلفية (سريعة جداً، ثوانٍ). يُستخدم لبناء تيمبلتات مطابقة
        تلقائياً لمواضع الشخصيات الحقيقية بصورة مرجعية.
        """
        self._load_yolo()
        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_rgb = np.array(image_pil)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        h, w = image_bgr.shape[:2]

        boxes = self._detect_all_characters(image_bgr)
        return {
            "image_width": w,
            "image_height": h,
            "boxes": [
                {"x1": b.x1, "y1": b.y1, "x2": b.x2, "y2": b.y2, "confidence": b.confidence}
                for b in boxes
            ],
        }

    def _detect_all_characters(self, image_bgr: np.ndarray) -> list[PersonBox]:
        """
        يرجّع كل الأشخاص المكتشفين بالصورة (مرتبين من اليسار لليمين، بنفس
        ترتيب صور اصطفاف الشخصيات المعتادة)، بدل شخصية واحدة فقط.
        """
        # للاستخراج الجماعي نستخدم عتبة ثقة أخفض (يلتقط شخصيات بوضعيات
        # غير معتادة/على الأطراف) وسماحية تداخل أعلى بين الصناديق (iou) حتى
        # لا يُدمَج شخصان متلاصقان ببعض كصندوق واحد فقط بالغلط
        results = self._yolo.predict(
            image_bgr,
            classes=[config.YOLO_PERSON_CLASS_ID],
            conf=0.15,
            iou=0.85,
            verbose=False,
        )
        boxes = results[0].boxes
        if boxes is None or len(boxes) == 0:
            return []

        detected = []
        for box in boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            bw, bh = x2 - x1, y2 - y1
            # فلتر منطقي: الشخص الواقف دايماً أطول من عرضه بوضوح (نسبة
            # ارتفاع/عرض > 1.3 تقريباً). أي صندوق شبه مربّع أو أعرض من طوله
            # غالباً كشف خاطئ (شعار، أيقونة، رمز بمنتصف الصورة) - نرفضه.
            if bh <= 0 or bw <= 0 or (bh / bw) < 1.3:
                continue
            detected.append(PersonBox(int(x1), int(y1), int(x2), int(y2), conf))

        # === إزالة الكشف المكرر لنفس الشخص (NMS) ===
        # عتبة iou العالية (0.85) بالكشف نفسه فوق تسمح أحياناً بصندوقين
        # متداخلين بقوة لنفس الشخص (خصوصاً بصور الاصطفاف المزدحمة) - نحتفظ
        # هنا بأعلى ثقة منهم فقط ونرمي أي صندوق آخر يتداخل معه بنسبة كبيرة
        def _iou(a: PersonBox, b: PersonBox) -> float:
            ix1, iy1 = max(a.x1, b.x1), max(a.y1, b.y1)
            ix2, iy2 = min(a.x2, b.x2), min(a.y2, b.y2)
            iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
            inter = iw * ih
            a_area = (a.x2 - a.x1) * (a.y2 - a.y1)
            b_area = (b.x2 - b.x1) * (b.y2 - b.y1)
            union = a_area + b_area - inter
            return inter / union if union > 0 else 0.0

        detected.sort(key=lambda b: -b.confidence)
        deduped: list[PersonBox] = []
        for b in detected:
            if all(_iou(b, kept) < 0.35 for kept in deduped):
                deduped.append(b)

        deduped.sort(key=lambda b: b.x1)  # من اليسار لليمين
        return deduped

    @staticmethod
    def _build_character_row(char_boxes: list[PersonBox]) -> list[PersonBox]:
        """يجمّع الشخصيات المكتشفة لمجموعات حسب ارتفاع الرأس (y1): شخصيات
        الصف الأمامي (الرئيسي) تشترك تقريباً بنفس y1، بينما أي شخصيات جزئية
        تظهر خلف/بين الصف الرئيسي (يوضحها هذا النوع من صور اصطفاف الحسابات
        عادة) يكون y1 عندها مختلف بوضوح لأنها أبعد/أصغر. نرجّع الصف الأكبر
        فقط (الرئيسي) بعد توحيد ارتفاعه وخط أرضه (median الأعلى والأسفل بدل
        القيمة الخام لكل صندوق) - لأن اختلاف الوضعية/الشعر/طول السلاح يعطي
        صناديق YOLO متفاوتة الحجم قليلاً رغم إن الشخصيات فعلياً بنفس الحجم
        تقريباً بالتصميم الأصلي؛ هذا يضمن تيمبلت بمسافات/أحجام متسقة فعلاً
        بدل نسخ عشوائية الحجم من كشف YOLO الخام مباشرة."""
        if not char_boxes:
            return []

        clusters: list[list[PersonBox]] = []
        for b in sorted(char_boxes, key=lambda b: b.y1):
            placed = False
            for c in clusters:
                if abs(b.y1 - c[0].y1) < 60:
                    c.append(b)
                    placed = True
                    break
            if not placed:
                clusters.append([b])

        main = max(clusters, key=len)
        tops = sorted(b.y1 for b in main)
        bottoms = sorted(b.y2 for b in main)
        median_top = tops[len(tops) // 2]
        median_bottom = bottoms[len(bottoms) // 2]

        normalized = [
            PersonBox(x1=b.x1, y1=median_top, x2=b.x2, y2=median_bottom, confidence=b.confidence)
            for b in main
        ]
        normalized.sort(key=lambda b: b.x1)
        return normalized

    # ------------------------------------------------------------------ #
    # الواجهة العامة: استخراج كل الشخصيات دفعة واحدة
    # ------------------------------------------------------------------ #
    def remove_background_multi(self, image_bytes: bytes) -> list[bytes]:
        self.load_all()

        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_rgb = np.array(image_pil)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        h, w = image_rgb.shape[:2]

        boxes = self._detect_all_characters(image_bgr)
        if not boxes:
            return [self.remove_background(image_bytes)]

        results = []
        for box in boxes:
            # نقصّ منطقة واسعة حوالين كل شخصية بمفردها (تشمل مساحة كافية
            # للسلاح الممتد) ونعالجها كأنها "صورة فردية" مستقلة تماماً -
            # هذا يضمن أن BiRefNet يعطيها نفس مستوى الثقة العالي بكل
            # أجزائها (رأس/أرجل/سلاح) بدل معاملتها كجزء من مجموعة كبيرة.
            box_w, box_h = box.x2 - box.x1, box.y2 - box.y1
            crop_pad_x = int(box_w * 0.9)
            crop_pad_y = int(box_h * 0.35)
            crop_x1 = max(0, box.x1 - crop_pad_x)
            crop_y1 = max(0, box.y1 - crop_pad_y)
            crop_x2 = min(w, box.x2 + crop_pad_x)
            crop_y2 = min(h, box.y2 + crop_pad_y)

            crop_rgb = image_rgb[crop_y1:crop_y2, crop_x1:crop_x2]
            crop_pil = Image.fromarray(crop_rgb)

            # صندوق الشخصية بإحداثيات نسبية لمنطقة القصّ الجديدة
            local_box = PersonBox(
                x1=box.x1 - crop_x1,
                y1=box.y1 - crop_y1,
                x2=box.x2 - crop_x1,
                y2=box.y2 - crop_y1,
                confidence=box.confidence,
            )

            self._sam2_predictor.set_image(crop_rgb)
            sam2_mask = self._segment_with_sam2(crop_rgb, local_box)
            birefnet_alpha = self._matte_with_birefnet(crop_pil)
            # عتبة منفصلة خاصة بالاستخراج الجماعي فقط - أكثر تساهلاً من
            # الوضع الفردي (0.28)، ولا تؤثر عليه إطلاقاً مهما عدّلناها لاحقاً
            final_alpha = self._combine_masks(sam2_mask, birefnet_alpha, low_thresh=0.18)
            final_alpha = self._remove_disconnected_objects(final_alpha, local_box)

            rgba = np.dstack([crop_rgb, final_alpha])
            result_img = Image.fromarray(rgba, mode="RGBA")
            bbox = result_img.getbbox()
            if bbox:
                result_img = result_img.crop(bbox)

            out = io.BytesIO()
            result_img.save(out, format="PNG")
            results.append(out.getvalue())

        return results

    def prepare_tuning_session(self, image_bytes: bytes) -> str:
        """
        المرحلة الثقيلة فقط: كشف الشخصية + حساب embeddings الصورة لـ SAM2 +
        حساب alpha الخاص بـ BiRefNet. تُخزَّن النتائج بذاكرة مؤقتة، وترجّع
        معرّف جلسة (session_id) يُستخدم لاحقاً بدالة tune_combine للتعديل
        السريع بدون إعادة تشغيل النماذج الثقيلة من جديد.
        """
        import uuid

        self.load_all()

        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_rgb = np.array(image_pil)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        box = self._detect_main_character(image_bgr)
        self._sam2_predictor.set_image(image_rgb)
        birefnet_alpha = self._matte_with_birefnet(image_pil)

        session_id = uuid.uuid4().hex
        self._last_embedded_session = session_id
        # نحتفظ بحد أقصى 5 جلسات بالذاكرة لتفادي تراكم استهلاك الرام
        if len(self._tuning_cache) >= 5:
            oldest_key = next(iter(self._tuning_cache))
            del self._tuning_cache[oldest_key]

        self._tuning_cache[session_id] = {
            "image_rgb": image_rgb,
            "box": box,
            "birefnet_alpha": birefnet_alpha,
        }
        return session_id

    def tune_combine(
        self,
        session_id: str,
        low_thresh: float = 0.28,
        high_thresh: float = 0.60,
        pad_x_ratio: float = 0.40,
        pad_y_ratio: float = 0.15,
    ) -> bytes:
        """
        المرحلة الخفيفة: تعيد استخدام نتائج prepare_tuning_session المخزَّنة
        (بدون إعادة تشغيل YOLO أو BiRefNet)، وتشغّل فقط SAM2.predict (رخيصة
        طالما الصورة نفسها محفوظة بالذاكرة عبر set_image) + دمج الأقنعة
        بالإعدادات الجديدة. سريعة جداً (ثوانٍ) مقارنة بالمرحلة الثقيلة.
        """
        cached = self._tuning_cache.get(session_id)
        if not cached:
            raise ValueError("جلسة التعديل غير موجودة أو انتهت صلاحيتها. ارفع الصورة من جديد.")

        image_rgb = cached["image_rgb"]
        box = cached["box"]
        birefnet_alpha = cached["birefnet_alpha"]

        # نتخطى إعادة الحساب الأبطأ (set_image) لو كانت نفس الجلسة محمّلة
        # فعلياً بذاكرة SAM2 من طلب سابق - هذا هو مصدر السرعة الحقيقي هنا.
        if self._last_embedded_session != session_id:
            self._sam2_predictor.set_image(image_rgb)
            self._last_embedded_session = session_id
        sam2_mask = self._segment_with_sam2(
            image_rgb, box, pad_x_ratio=pad_x_ratio, pad_y_ratio=pad_y_ratio
        )
        final_alpha = self._combine_masks(
            sam2_mask, birefnet_alpha, low_thresh=low_thresh, high_thresh=high_thresh
        )
        final_alpha = self._remove_disconnected_objects(final_alpha, box)

        rgba = np.dstack([image_rgb, final_alpha])
        result_img = Image.fromarray(rgba, mode="RGBA")

        out = io.BytesIO()
        result_img.save(out, format="PNG")
        return out.getvalue()

    def _estimate_glossy_ratio(self, image_bgr: np.ndarray, box: PersonBox) -> float:
        """
        يقيس نسبة البكسلات "اللامعة/الفاتحة جداً" (تشبع لوني منخفض + سطوع
        عالٍ) داخل صندوق الكشف - مؤشر شائع للمواد الشفافة/الجليدية/الزجاجية
        (زي أسلحة Glacier) اللي يصعب على النموذج تمييزها عن الخلفية.
        """
        h, w = image_bgr.shape[:2]
        x1, y1 = max(0, box.x1), max(0, box.y1)
        x2, y2 = min(w, box.x2), min(h, box.y2)
        region = image_bgr[y1:y2, x1:x2]
        if region.size == 0:
            return 0.0
        hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
        saturation = hsv[:, :, 1]
        value = hsv[:, :, 2]
        glossy_mask = (saturation < 60) & (value > 150)
        return float(glossy_mask.mean())

    def remove_background(
        self,
        image_bytes: bytes,
        low_thresh: float | None = None,
        high_thresh: float | None = None,
        capture_padding_x: float | None = None,
        capture_padding_y: float | None = None,
        use_black_bg_refine: bool | None = None,
    ) -> bytes:
        """
        low_thresh/high_thresh/capture_padding_*: لو انمررت (مو None)، تُستخدم
        كما هي بالضبط ويُعطَّل فحص الجودة التلقائي - يفيد للتجربة اليدوية من
        الواجهة (تعديل مباشر لإيجاد أفضل قيمة لصورة صعبة معيّنة). لو انتُركت
        فاضية (None)، يشتغل النظام بإعداداته الافتراضية المعتادة + فحص الجودة.
        """
        manual_override = low_thresh is not None or high_thresh is not None
        self.load_all()

        image_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image_rgb = np.array(image_pil)
        image_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)

        box = self._detect_main_character(image_bgr)
        logger.info(
            "تشخيص: صندوق الكشف x1=%d y1=%d x2=%d y2=%d ثقة=%.2f",
            box.x1, box.y1, box.x2, box.y2, box.confidence,
        )

        # لو YOLO فشل (صندوق = الصورة كاملة، confidence=0.0)، هذا صندوق غامض
        # جداً كـ"موجّه" لـ SAM2 (يخليه يختار منطقة عشوائية قد لا تطابق مكان
        # الشخصية فعلياً). البديل الأدق: نشغّل BiRefNet أولاً (لا يحتاج صندوق
        # أصلاً، يحلل الصورة كاملة) ونستخدم حدود المنطقة اللي لقاها كصندوق
        # موجّه لـ SAM2 بدل الصورة كاملة - أدق بكثير في هذي الحالة النادرة.
        h, w = image_rgb.shape[:2]
        yolo_failed = box.confidence == 0.0 and box.x1 == 0 and box.y1 == 0 and box.x2 == w and box.y2 == h

        birefnet_input_pre = image_pil
        birefnet_alpha_pre = None
        if yolo_failed:
            birefnet_alpha_pre = self._matte_with_birefnet(birefnet_input_pre)
            ys, xs = np.where(birefnet_alpha_pre > 60)
            if len(xs) > 0:
                new_box = PersonBox(
                    x1=int(xs.min()), y1=int(ys.min()), x2=int(xs.max()), y2=int(ys.max()), confidence=0.0
                )
                logger.info(
                    "تشخيص: استخدام حدود BiRefNet كصندوق بديل x1=%d y1=%d x2=%d y2=%d",
                    new_box.x1, new_box.y1, new_box.x2, new_box.y2,
                )
                box = new_box

        self._sam2_predictor.set_image(image_rgb)
        sam2_mask = self._segment_with_sam2(
            image_rgb, box, pad_x_ratio=capture_padding_x, pad_y_ratio=capture_padding_y
        )
        logger.info(
            "تشخيص: sam2_mask sum=%.1f max=%.3f",
            float(sam2_mask.sum()), float(sam2_mask.max() if sam2_mask.size else 0),
        )

        # === تسويد الخلفية التقريبية (Coarse-to-Fine) - تجريبي ===
        # ⚠️ يشتغل فقط لو المستخدم فعّله يدوياً بالضبط (use_black_bg_refine=True).
        # لا يوجد تفعيل تلقائي ضمني - ثبت إنه قد يخرّب نتائج صحيحة على مشاهد
        # داكنة/معقدة (إضاءة متوهجة بالخلفية قد تُحسب "لامعة" بالغلط).
        should_blacken = bool(use_black_bg_refine)

        if should_blacken:
            dilate_kernel = np.ones((25, 25), np.uint8)
            dilated_mask = cv2.dilate((sam2_mask > 25).astype(np.uint8) * 255, dilate_kernel)
            keep = dilated_mask > 0
            blackened_rgb = image_rgb.copy()
            blackened_rgb[~keep] = 0
            birefnet_input = Image.fromarray(blackened_rgb)
            birefnet_alpha = self._matte_with_birefnet(birefnet_input)
        elif birefnet_alpha_pre is not None:
            # سبق حسبناه فوق (حالة فشل YOLO) - لا داعي لتشغيل BiRefNet مرتين
            birefnet_alpha = birefnet_alpha_pre
        else:
            birefnet_alpha = self._matte_with_birefnet(image_pil)

        logger.info(
            "تشخيص: birefnet_alpha sum=%.1f max=%.3f should_blacken=%s",
            float(birefnet_alpha.sum()), float(birefnet_alpha.max() if birefnet_alpha.size else 0),
            should_blacken,
        )

        combine_kwargs = {}
        if low_thresh is not None:
            combine_kwargs["low_thresh"] = low_thresh
        if high_thresh is not None:
            combine_kwargs["high_thresh"] = high_thresh

        # ⚠️ ألغينا الكشف التلقائي الضمني للمواد اللامعة (كان يفعّل عتبة أخف
        # بدون طلب المستخدم) - ثبت إنه قد يسبب نتيجة فاضية تماماً بحالات
        # معيّنة. الآن العتبة الافتراضية (0.28) ثابتة دائماً بالوضع العادي؛
        # أي تعديل يصير فقط لو المستخدم فعّله يدوياً من الإعدادات المتقدمة.

        final_alpha = self._combine_masks(sam2_mask, birefnet_alpha, **combine_kwargs)
        final_alpha = self._remove_disconnected_objects(final_alpha, box)

        if not manual_override:
            # === فحص جودة تلقائي (فقط بالوضع الافتراضي، مو بالتجربة اليدوية) ===
            box_area = max(1, (box.x2 - box.x1) * (box.y2 - box.y1))
            mask_area = int((final_alpha > 25).sum())
            quality_ratio = mask_area / box_area

            if quality_ratio < 0.35:
                logger.warning(
                    "جودة القناع منخفضة (نسبة %.2f) - إعادة المعالجة بعتبة أكثر تساهلاً",
                    quality_ratio,
                )
                lenient_alpha = self._combine_masks(sam2_mask, birefnet_alpha, low_thresh=0.12)
                lenient_alpha = self._remove_disconnected_objects(lenient_alpha, box)
                lenient_mask_area = int((lenient_alpha > 25).sum())
                if lenient_mask_area > mask_area * 1.15:
                    final_alpha = lenient_alpha
                    mask_area = lenient_mask_area

                # === ملاذ أخير: لو النتيجة لسه شبه فاضية (SAM2 وBiRefNet ما
                # تطابقوا إطلاقاً، غالباً بخلفيات مزخرفة/معقدة تلخبط SAM2)،
                # نثق بـ BiRefNet لحاله (بدون تقاطع مع SAM2) بدل ما نرجّع
                # نتيجة فاضية بالكامل - BiRefNet أثبت أنه أدق بإيجاد الشخصية
                # حتى لما الصندوق أو SAM2 يفشلوا.
                if mask_area / box_area < 0.05:
                    logger.warning(
                        "لسه فاضية تقريباً بعد إعادة المحاولة - الاعتماد على BiRefNet لحاله كملاذ أخير"
                    )
                    biref_only = np.clip((birefnet_alpha.astype(np.float32) / 255.0 - 0.3) / 0.4, 0, 1)
                    biref_only = (biref_only * 255).astype(np.uint8)
                    biref_only = self._remove_disconnected_objects(biref_only, box)
                    biref_only_area = int((biref_only > 25).sum())
                    if biref_only_area > mask_area:
                        final_alpha = biref_only

        rgba = np.dstack([image_rgb, final_alpha])
        result_img = Image.fromarray(rgba, mode="RGBA")

        # ملاحظة: توقفنا عن القص التلقائي على حدود المحتوى هنا عمداً - نبقي
        # نفس أبعاد الصورة الأصلية بالضبط، عشان تتطابق تماماً (بكسل ببكسل)
        # مع أداة "الممحاة اليدوية" بالواجهة الأمامية التي تحتاج محاذاة
        # دقيقة بين الصورة الأصلية والنتيجة لتمكين استعادة أي جزء يدوياً.
        # القص النهائي (لتصغير حجم الملف) يصير بالمتصفح وقت التحميل فقط.

        out = io.BytesIO()
        result_img.save(out, format="PNG")
        return out.getvalue()


# مثيل واحد (Singleton) يُعاد استخدامه عبر كل الطلبات
pipeline = BackgroundRemovalPipeline()


# ============================================================
# اكتشاف شبكة عناصر (Grid) داخل منطقة محددة من صورة، وقصّها بدقة
# على حدود كل بطاقة الفعلية (بالاعتماد على التشبّع اللوني: بطاقات
# اللعبة عادة ملوّنة بتدرّج بينما الفجوات بينها رمادية/داكنة محايدة)
# ============================================================
def _find_segments(profile: np.ndarray, threshold: float, min_len: int) -> list[tuple[int, int]]:
    above = profile > threshold
    segments: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(above):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                segments.append((start, i))
            start = None
    if start is not None and len(above) - start >= min_len:
        segments.append((start, len(above)))
    return segments


def slice_grid(
    image_bytes: bytes,
    rect_x: int,
    rect_y: int,
    rect_w: int,
    rect_h: int,
    saturation_threshold: float = 70.0,
) -> list[dict]:
    """
    يقص منطقة (rect) من الصورة الأصلية، ويكتشف تلقائياً حدود كل "بطاقة"
    داخلها بالاعتماد على التشبّع اللوني، ويرجّع كل خلية كـ PNG مستقل.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    full = np.array(image)
    full_bgr = cv2.cvtColor(full, cv2.COLOR_RGB2BGR)

    h, w = full_bgr.shape[:2]
    x1 = max(0, rect_x)
    y1 = max(0, rect_y)
    x2 = min(w, rect_x + rect_w)
    y2 = min(h, rect_y + rect_h)
    region = full_bgr[y1:y2, x1:x2]

    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1].astype(float)

    col_sat = sat.mean(axis=0)
    row_sat = sat.mean(axis=1)

    min_len_col = max(10, region.shape[1] // 20)
    min_len_row = max(10, region.shape[0] // 20)

    col_segments = _find_segments(col_sat, saturation_threshold, min_len_col)
    row_segments = _find_segments(row_sat, saturation_threshold, min_len_row)

    cells = []
    for ri, (ry1, ry2) in enumerate(row_segments):
        for ci, (cx1, cx2) in enumerate(col_segments):
            cell_bgr = region[ry1:ry2, cx1:cx2]
            cell_rgb = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2RGB)
            cell_img = Image.fromarray(cell_rgb)
            buf = io.BytesIO()
            cell_img.save(buf, format="PNG")
            cells.append({"row": ri, "col": ci, "png_bytes": buf.getvalue()})

    return cells


def slice_grid_by_color(
    image_bytes: bytes,
    rect_x: int,
    rect_y: int,
    rect_w: int,
    rect_h: int,
) -> list[dict]:
    """
    طريقة اكتشاف بديلة: تحدد حدود كل بطاقة عبر البحث عن ألوان إطارات
    البطاقات الشائعة (وردي/بنفسجي/أحمر/ذهبي) + تحليل Contours، بدل التحليل
    الخطي بالتشبع. أدق لبطاقات ذات إطارات ملوّنة واضحة، لكن يجب أن تُطبَّق
    داخل منطقة محددة يدوياً (وليس على الصورة كاملة) لتفادي التباس ألوان
    ملابس الشخصيات بألوان إطارات البطاقات.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    full = np.array(image)
    full_bgr = cv2.cvtColor(full, cv2.COLOR_RGB2BGR)

    h, w = full_bgr.shape[:2]
    x1 = max(0, rect_x)
    y1 = max(0, rect_y)
    x2 = min(w, rect_x + rect_w)
    y2 = min(h, rect_y + rect_h)
    region = full_bgr[y1:y2, x1:x2]
    rh, rw = region.shape[:2]

    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)

    # نطاقات ألوان إطارات البطاقات الشائعة بألعاب الموبايل (Battle Royale)
    color_ranges = [
        ((140, 40, 60), (170, 255, 255)),  # وردي
        ((120, 40, 60), (150, 255, 255)),  # بنفسجي
        ((0, 60, 60), (10, 255, 255)),     # أحمر
        ((170, 60, 60), (180, 255, 255)),  # أحمر (الطرف الثاني بعجلة الألوان)
        ((15, 60, 100), (35, 255, 255)),   # ذهبي
    ]
    combined_mask = np.zeros((rh, rw), dtype=np.uint8)
    for lo, hi in color_ranges:
        mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
        combined_mask = cv2.bitwise_or(combined_mask, mask)

    kernel = np.ones((5, 5), np.uint8)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    min_area = max(500, (rw * rh) // 500)  # يتكيف مع حجم المنطقة المحددة
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        area = cw * ch
        if area > min_area and 0.5 < (cw / ch) < 2.0:
            boxes.append((x, y, cw, ch))

    # ترتيب البطاقات: من أعلى لأسفل، ثم من اليسار لليمين (لتقريب ترتيب صف/عمود)
    boxes.sort(key=lambda b: (round(b[1] / 40), b[0]))

    cells = []
    for i, (x, y, cw, ch) in enumerate(boxes):
        cell_bgr = region[y : y + ch, x : x + cw]
        cell_rgb = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2RGB)
        cell_img = Image.fromarray(cell_rgb)
        buf = io.BytesIO()
        cell_img.save(buf, format="PNG")
        cells.append({"row": i // 20, "col": i % 20, "png_bytes": buf.getvalue()})

    return cells
