import { useEffect, useRef, useState } from "react";

// أداة تعديل يدوي: تمسح أجزاء غير مرغوبة (تحوّلها شفافة)، أو تستعيد أجزاء
// حذفها الذكاء الاصطناعي بالغلط (تسحبها من الصورة الأصلية قبل المعالجة).
export default function ManualEraser({ beforeUrl, resultBlob, onSave, onClose }) {
  const canvasRef = useRef(null); // القماشة المرئية النهائية
  const originalCanvasRef = useRef(null); // نسخة مخفية من الصورة الأصلية (RGB) لأخذ البكسلات منها عند الاستعادة
  const resultCanvasRef = useRef(null); // نسخة مخفية تحتفظ بحالة النتيجة الحالية (RGBA)
  const containerRef = useRef(null);

  const [mode, setMode] = useState("erase"); // erase | restore
  const [brushSize, setBrushSize] = useState(40);
  const [isDrawing, setIsDrawing] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);
  const [history, setHistory] = useState([]); // لتتبع التراجع (Undo)
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      const beforeImg = new Image();
      beforeImg.crossOrigin = "anonymous";
      const resultUrl = URL.createObjectURL(resultBlob);
      const resultImg = new Image();
      resultImg.crossOrigin = "anonymous";

      await Promise.all([
        new Promise((res) => {
          beforeImg.onload = res;
          beforeImg.src = beforeUrl;
        }),
        new Promise((res) => {
          resultImg.onload = res;
          resultImg.src = resultUrl;
        }),
      ]);

      if (cancelled) return;

      const width = resultImg.width;
      const height = resultImg.height;

      // قماشة الصورة الأصلية (مخفية، للاستعادة منها فقط)
      const origCanvas = document.createElement("canvas");
      origCanvas.width = width;
      origCanvas.height = height;
      const origCtx = origCanvas.getContext("2d");
      // الصورة الأصلية قد تكون بأبعاد مختلفة قليلاً؛ نرسمها بنفس أبعاد النتيجة
      origCtx.drawImage(beforeImg, 0, 0, width, height);
      originalCanvasRef.current = origCanvas;

      // قماشة النتيجة الحالية (مخفية، تُحدَّث بكل عملية رسم)
      const resCanvas = document.createElement("canvas");
      resCanvas.width = width;
      resCanvas.height = height;
      const resCtx = resCanvas.getContext("2d");
      resCtx.drawImage(resultImg, 0, 0);
      resultCanvasRef.current = resCanvas;

      // القماشة المرئية
      const visibleCanvas = canvasRef.current;
      visibleCanvas.width = width;
      visibleCanvas.height = height;
      const visibleCtx = visibleCanvas.getContext("2d");
      visibleCtx.drawImage(resCanvas, 0, 0);

      // مقياس العرض حتى يظهر بحجم مناسب بالشاشة
      const maxDisplayWidth = Math.min(900, containerRef.current?.offsetWidth || 900);
      setDisplayScale(Math.min(1, maxDisplayWidth / width));

      URL.revokeObjectURL(resultUrl);
      setLoaded(true);
    };

    loadImages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveHistorySnapshot = () => {
    const resCanvas = resultCanvasRef.current;
    const ctx = resCanvas.getContext("2d");
    const snapshot = ctx.getImageData(0, 0, resCanvas.width, resCanvas.height);
    setHistory((prev) => [...prev.slice(-9), snapshot]); // نحتفظ بآخر 10 خطوات بس
  };

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / displayScale,
      y: (clientY - rect.top) / displayScale,
    };
  };

  const applyBrush = (x, y) => {
    const resCanvas = resultCanvasRef.current;
    const resCtx = resCanvas.getContext("2d");
    const radius = brushSize / 2;

    if (mode === "erase") {
      // نمسح (نجعلها شفافة تماماً) بمنطقة الفرشاة
      resCtx.save();
      resCtx.globalCompositeOperation = "destination-out";
      resCtx.beginPath();
      resCtx.arc(x, y, radius, 0, Math.PI * 2);
      resCtx.fill();
      resCtx.restore();
    } else {
      // نستعيد من الصورة الأصلية داخل منطقة دائرية فقط
      resCtx.save();
      resCtx.beginPath();
      resCtx.arc(x, y, radius, 0, Math.PI * 2);
      resCtx.clip();
      resCtx.drawImage(originalCanvasRef.current, 0, 0);
      resCtx.restore();
    }

    // نحدّث القماشة المرئية
    const visibleCtx = canvasRef.current.getContext("2d");
    visibleCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    visibleCtx.drawImage(resCanvas, 0, 0);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    saveHistorySnapshot();
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    applyBrush(x, y);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    applyBrush(x, y);
  };

  const handlePointerUp = () => setIsDrawing(false);

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    const resCtx = resultCanvasRef.current.getContext("2d");
    resCtx.putImageData(last, 0, 0);
    setHistory((prev) => prev.slice(0, -1));

    const visibleCtx = canvasRef.current.getContext("2d");
    visibleCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    visibleCtx.drawImage(resultCanvasRef.current, 0, 0);
  };

  const handleSave = () => {
    const resCanvas = resultCanvasRef.current;
    // نقص تلقائياً على حدود المحتوى الفعلي (alpha > 0) لتصغير حجم الملف
    const ctx = resCanvas.getContext("2d");
    const { data, width, height } = ctx.getImageData(0, 0, resCanvas.width, resCanvas.height);
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    let finalCanvas = resCanvas;
    if (maxX >= minX && maxY >= minY) {
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropW;
      cropCanvas.height = cropH;
      cropCanvas.getContext("2d").drawImage(resCanvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
      finalCanvas = cropCanvas;
    }

    finalCanvas.toBlob((blob) => {
      onSave(blob);
    }, "image/png");
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 py-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <h2 className="text-lg font-bold">✏️ تعديل يدوي</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-xl">
            ✕
          </button>
        </div>

        <div className="flex gap-2 flex-wrap p-4 items-center border-b border-neutral-800">
          <button
            onClick={() => setMode("erase")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              mode === "erase" ? "bg-red-600 text-white" : "bg-neutral-800 text-neutral-400"
            }`}
          >
            🧹 مسح
          </button>
          <button
            onClick={() => setMode("restore")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              mode === "restore" ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-400"
            }`}
          >
            ↩️ استعادة من الأصل
          </button>

          <div className="flex items-center gap-2 bg-neutral-800 rounded-xl px-3 py-2">
            <span className="text-neutral-400 text-xs">حجم الفرشاة</span>
            <input
              type="range"
              min={10}
              max={150}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-28 accent-amber-500"
            />
            <span className="text-neutral-500 text-xs w-8">{brushSize}</span>
          </div>

          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 px-4 py-2 rounded-xl text-sm transition-colors"
          >
            ↶ تراجع
          </button>

          <button
            onClick={handleSave}
            className="mr-auto bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            💾 حفظ التعديل
          </button>
        </div>

        <p className="text-neutral-600 text-xs px-4 pt-2">
          💡 وضع "مسح" يشيل أي جزء غير مرغوب. وضع "استعادة" يرجّع البكسلات من الصورة
          الأصلية (يفيد لو الذكاء الاصطناعي حذف جزء بالغلط، زي سلاح ناقص).
        </p>

        <div ref={containerRef} className="flex-1 overflow-auto p-4 flex items-center justify-center">
          {!loaded ? (
            <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
          ) : (
            <div
              className="relative transparency-grid inline-block"
              style={{ touchAction: "none" }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: canvasRef.current ? canvasRef.current.width * displayScale : "auto",
                  cursor: "crosshair",
                  display: "block",
                }}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
