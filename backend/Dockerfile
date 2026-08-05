# صورة الباك إند (FastAPI + YOLO + SAM2 + BiRefNet). افتراضياً CPU (تعمل بأي
# استضافة عادية بدون GPU، لكن المعالجة أبطأ). لو عندك استضافة بها GPU:
# 1) بدّل السطر الأول لصورة قاعدة تدعم CUDA، مثلاً:
#    FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04
# 2) ثبّت بايثون 3.11 عليها يدوياً، أو استخدم صورة جاهزة فيها بايثون+cuda.
# 3) غيّر BG_REMOVER_DEVICE=cuda وقت التشغيل (متغيّر بيئة، انظر docker-compose.yml).
FROM python:3.11-slim

# مكتبات نظام مطلوبة لـ opencv-python-headless + تحميل sam2 من git
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# pip أكثر تسامحاً مع انقطاعات الشبكة المؤقتة (نتصل بنت غير مستقر) - بدل ما
# يفشل الطلب كامل على أول قطع اتصال
ENV PIP_DEFAULT_TIMEOUT=120
ENV PIP_RETRIES=15

COPY requirements.txt .

# كل مجموعة بخطوة RUN منفصلة = طبقة Docker محفوظة (cached) لحالها. لو صار
# انقطاع نت بمنتصف خطوة، إعادة تشغيل البناء تكمل من نفس الخطوة فقط - بدل ما
# تعيد تحميل كل شي (فاستابي + أوبن سي في + تورش + ساعة كاملة...) من الصفر
# كل مرة يفشل تحميل ملف واحد أخير. القيم هنا لازم تنطابق مع requirements.txt.
RUN pip install --no-cache-dir fastapi==0.115.0 "uvicorn[standard]==0.30.6" python-multipart==0.0.9
RUN pip install --no-cache-dir pillow==10.4.0 opencv-python-headless==4.10.0.84 numpy==1.26.4
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    torch==2.5.1+cpu torchvision==0.20.1+cpu
RUN pip install --no-cache-dir timm==1.0.9 transformers==4.44.2 huggingface_hub==0.24.6 accelerate==0.34.2
# اعتماديات كود YOLOX المُضمَّن (app/vendor/yolox، Apache-2.0) - انظر
# requirements.txt لتفصيل سبب استبدال ultralytics (AGPL-3.0) به
RUN pip install --no-cache-dir loguru==0.7.3 tqdm==4.69.0 tabulate==0.10.0 \
    thop==0.1.1.post2209072238 ninja==1.13.0 psutil==7.2.2 tensorboard==2.21.0

# --no-build-isolation: sam2 يحتاج torch وقت البناء (كشف CUDA/تجميع إضافات
# اختيارية) - بدون هذا الخيار pip يبني بمكان معزول تماماً ويعيد تحميل torch
# بالكامل من جديد هناك (كان يعلّق لأكثر من ساعة على نتنا البطيء) بدل ما
# يستخدم النسخة المثبّتة أصلاً بالطبقة اللي فوق
RUN pip install --no-cache-dir --no-build-isolation \
    https://github.com/facebookresearch/sam2/archive/refs/heads/main.zip

COPY app ./app

# أوزان SAM2/BiRefNet/YOLO تُحمَّل تلقائياً أول طلب فعلي (انظر app/pipeline.py:
# load_all/_load_yolo/_load_sam2/_load_birefnet) وتُخزَّن بمجلد weights/ هنا -
# اربطه بـ volume دائم (انظر docker-compose.yml) وإلا تُعاد تحميلها بكل نشر جديد.

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
