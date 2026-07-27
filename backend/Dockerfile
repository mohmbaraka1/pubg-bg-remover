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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# أوزان SAM2/BiRefNet/YOLO تُحمَّل تلقائياً أول طلب فعلي (انظر app/pipeline.py:
# load_all/_load_yolo/_load_sam2/_load_birefnet) وتُخزَّن بمجلد weights/ هنا -
# اربطه بـ volume دائم (انظر docker-compose.yml) وإلا تُعاد تحميلها بكل نشر جديد.

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
