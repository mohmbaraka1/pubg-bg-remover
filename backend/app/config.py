"""
إعدادات عامة للمشروع - المرحلة الأولى فقط: استخراج الشخصية وإزالة الخلفية.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WEIGHTS_DIR = BASE_DIR / "weights"
WEIGHTS_DIR.mkdir(exist_ok=True)

# ---- Device ----
# يستخدم GPU تلقائياً إذا كان متوفراً، وإلا يعمل على CPU (أبطأ لكنه يعمل).
DEVICE = os.environ.get("BG_REMOVER_DEVICE", "auto")  # "auto" | "cuda" | "cpu"

# ---- SAM2 ----
# نستخدم إصدار "large" لأعلى دقة في استخراج تفاصيل الملابس والسلاح.
# يمكن تبديله بـ "sam2.1_hiera_small.pt" لو أردت سرعة أكبر بدقة أقل بسيطة.
SAM2_MODEL_CFG = "configs/sam2.1/sam2.1_hiera_l.yaml"
SAM2_CHECKPOINT_URL = (
    "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt"
)
SAM2_CHECKPOINT_PATH = WEIGHTS_DIR / "sam2.1_hiera_large.pt"

# ---- BiRefNet (Matting / تنعيم الحواف والتفاصيل الدقيقة) ----
BIREFNET_MODEL_ID = "ZhengPeng7/BiRefNet"  # Hugging Face model id
BIREFNET_INPUT_SIZE = (1024, 1024)

# ---- YOLO (لتحديد صندوق الشخصية الرئيسية تلقائياً) ----
YOLO_MODEL_ID = "yolov8m.pt"  # يُحمَّل تلقائياً بواسطة ultralytics
YOLO_PERSON_CLASS_ID = 0  # "person" في COCO
YOLO_CONF_THRESHOLD = 0.25

# ---- FSRCNN (تكبير الصور بالذكاء الاصطناعي - Super Resolution) ----
FSRCNN_MODEL_URL = (
    "https://github.com/Saafke/FSRCNN_Tensorflow/raw/master/models/FSRCNN_x4.pb"
)
FSRCNN_MODEL_PATH = WEIGHTS_DIR / "FSRCNN_x4.pb"
FSRCNN_SCALE = 4

# ---- Upload limits ----
MAX_UPLOAD_MB = 15
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}

# ---- CORS ----
# قائمة origins مفصولة بفواصل (مثلاً: "https://gsstudio.app,https://www.gsstudio.app")
# عبر متغيّر بيئة CORS_ALLOWED_ORIGINS. لو غير معرّف (التطوير المحلي)، يُسمح
# للكل "*" كما كان سابقاً. بالإنتاج لازم تحدّد نطاقك الحقيقي هنا.
_cors_env = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()] if _cors_env else ["*"]
