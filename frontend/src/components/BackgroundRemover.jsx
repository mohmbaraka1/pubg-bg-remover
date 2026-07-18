import { useCallback, useRef, useState } from "react";

const API_URL = "/api/remove-background";

const STAGES = {
  IDLE: "idle",
  READY: "ready",
  PROCESSING: "processing",
  DONE: "done",
  ERROR: "error",
};

export default function BackgroundRemover() {
  const [stage, setStage] = useState(STAGES.IDLE);
  const [beforeUrl, setBeforeUrl] = useState(null);
  const [afterUrl, setAfterUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");

  const fileInputRef = useRef(null);
  const progressTimerRef = useRef(null);

  const resetState = () => {
    setStage(STAGES.IDLE);
    setBeforeUrl(null);
    setAfterUrl(null);
    setProgress(0);
    setError("");
    setFileName("");
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
  };

  const handleFile = useCallback((file) => {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("صيغة غير مدعومة. الرجاء رفع PNG أو JPG أو WEBP.");
      setStage(STAGES.ERROR);
      return;
    }

    setError("");
    setFileName(file.name);
    setBeforeUrl(URL.createObjectURL(file));
    setAfterUrl(null);
    setStage(STAGES.READY);
    fileInputRef.current._selectedFile = file;
  }, []);

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const startFakeProgress = () => {
    // شريط تقدم تقريبي أثناء المعالجة الفعلية (المعالجة تتم على السيرفر
    // ولا يوجد بث تقدم حقيقي من النموذج، لذلك نُقارب بصرياً حتى وصول الرد).
    setProgress(5);
    progressTimerRef.current = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.random() * 8 : p));
    }, 400);
  };

  const stopFakeProgress = (finalValue) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setProgress(finalValue);
  };

  const handleRemoveBackground = async () => {
    const file = fileInputRef.current?._selectedFile;
    if (!file) return;

    setStage(STAGES.PROCESSING);
    setError("");
    startFakeProgress();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `فشل الطلب (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      stopFakeProgress(100);
      setAfterUrl(URL.createObjectURL(blob));
      setStage(STAGES.DONE);
    } catch (err) {
      stopFakeProgress(0);
      setError(err.message || "حدث خطأ غير متوقع أثناء إزالة الخلفية.");
      setStage(STAGES.ERROR);
    }
  };

  const handleDownload = () => {
    if (!afterUrl) return;
    const a = document.createElement("a");
    a.href = afterUrl;
    const base = fileName.replace(/\.[^/.]+$/, "") || "character";
    a.download = `${base}_no_bg.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Background Remover
          </h1>
          <p className="text-neutral-400 mt-2 text-sm">
            استخراج شخصية PUBG Mobile كاملة وإزالة الخلفية تلقائياً — المرحلة الأولى
          </p>
        </header>

        {/* منطقة الرفع / Drag & Drop */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer
            ${isDragging ? "border-amber-400 bg-amber-400/5" : "border-neutral-700 bg-neutral-900"}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onInputChange}
          />
          <p className="text-neutral-300 font-medium">
            اسحب وأفلت صورة الشاشة هنا، أو
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-3 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-5 py-2 rounded-xl transition-colors"
          >
            Upload
          </button>
          <p className="text-neutral-500 text-xs mt-3">PNG / JPG / WEBP — حتى 15MB</p>
        </div>

        {/* اسم الملف المختار */}
        {fileName && (
          <p className="text-neutral-400 text-sm mt-3 text-center truncate">{fileName}</p>
        )}

        {/* زر إزالة الخلفية */}
        {stage !== STAGES.IDLE && (
          <div className="flex justify-center mt-6">
            <button
              type="button"
              disabled={stage === STAGES.PROCESSING || !beforeUrl}
              onClick={handleRemoveBackground}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 disabled:cursor-not-allowed
                text-neutral-950 font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {stage === STAGES.PROCESSING ? "جارِ المعالجة..." : "Remove Background"}
            </button>
          </div>
        )}

        {/* شريط التقدم */}
        {stage === STAGES.PROCESSING && (
          <div className="mt-6">
            <div className="w-full h-2.5 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-300 ease-out"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="text-neutral-500 text-xs text-center mt-2">
              {Math.round(progress)}% — SAM2 + BiRefNet يعملان على الصورة
            </p>
          </div>
        )}

        {/* رسالة خطأ */}
        {stage === STAGES.ERROR && error && (
          <div className="mt-6 bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        {/* المعاينة قبل / بعد */}
        {(beforeUrl || afterUrl) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <div>
              <p className="text-neutral-400 text-sm mb-2 text-center">Before</p>
              <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 aspect-square flex items-center justify-center">
                {beforeUrl ? (
                  <img src={beforeUrl} alt="before" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-neutral-600 text-sm">لا توجد صورة بعد</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-neutral-400 text-sm mb-2 text-center">After</p>
              <div className="rounded-xl overflow-hidden border border-neutral-800 transparency-grid aspect-square flex items-center justify-center">
                {afterUrl ? (
                  <img src={afterUrl} alt="after" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-neutral-600 text-sm">
                    {stage === STAGES.PROCESSING ? "جارِ المعالجة..." : "بانتظار المعالجة"}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* زر التحميل */}
        {stage === STAGES.DONE && afterUrl && (
          <div className="flex flex-col items-center gap-3 mt-8">
            <button
              type="button"
              onClick={handleDownload}
              className="bg-neutral-100 hover:bg-white text-neutral-950 font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={resetState}
              className="text-neutral-500 hover:text-neutral-300 text-sm underline underline-offset-4"
            >
              رفع صورة أخرى
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
