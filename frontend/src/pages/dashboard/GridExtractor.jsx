import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva";
import useImage from "use-image";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";
const DISPLAY_MAX_WIDTH = 900;
const GRID_SLICE_API = "/api/grid-slice";

const CATEGORIES = [
  { key: "weapons", label: "Weapons" },
  { key: "vehicles", label: "Vehicles" },
  { key: "outfits", label: "Outfits" },
  { key: "xsuits", label: "X-Suits" },
  { key: "backpacks", label: "Backpacks" },
  { key: "helmets", label: "Helmets" },
  { key: "frames", label: "Frames" },
  { key: "emotes", label: "Emotes" },
  { key: "achievements", label: "Achievements" },
  { key: "other", label: "Other" },
];

export default function GridExtractor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [originalFile, setOriginalFile] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [image] = useImage(imgSrc, "anonymous");
  const [displayScale, setDisplayScale] = useState(1);
  const [rect, setRect] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [cells, setCells] = useState([]);
  const [slicing, setSlicing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef();
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === ADMIN_EMAIL));
  }, []);

  useEffect(() => {
    if (image) {
      const scale = Math.min(1, DISPLAY_MAX_WIDTH / image.width);
      setDisplayScale(scale);
      setRect({
        x: image.width * scale * 0.55,
        y: image.height * scale * 0.05,
        width: image.width * scale * 0.4,
        height: image.height * scale * 0.9,
      });
      setCells([]);
    }
  }, [image]);

  useEffect(() => {
    if (trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [rect]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = () => setImgSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleAutoSlice = async () => {
    if (!originalFile || !rect || !image) return;

    // نحوّل إحداثيات المستطيل من مقياس العرض للحجم الحقيقي للصورة الأصلية
    const realX = Math.round(rect.x / displayScale);
    const realY = Math.round(rect.y / displayScale);
    const realW = Math.round(rect.width / displayScale);
    const realH = Math.round(rect.height / displayScale);

    setSlicing(true);
    try {
      const formData = new FormData();
      formData.append("file", originalFile);
      formData.append("rect_x", realX);
      formData.append("rect_y", realY);
      formData.append("rect_w", realW);
      formData.append("rect_h", realH);
      formData.append("saturation_threshold", threshold);

      const res = await fetch(GRID_SLICE_API, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `فشل الطلب (HTTP ${res.status})`);
      }
      const data = await res.json();

      if (data.cells.length === 0) {
        alert("ما لقيت أي عنصر بهالمنطقة. جرب تحرّك المستطيل أو تعدّل حساسية الاكتشاف.");
        setSlicing(false);
        return;
      }

      const newCells = data.cells.map((c) => ({
        id: `cell_${c.row}_${c.col}_${Date.now()}`,
        dataUrl: `data:image/png;base64,${c.image_base64}`,
        name: "",
        category: "weapons",
        include: true,
      }));
      setCells(newCells);
    } catch (err) {
      alert(err.message || "فشل تقطيع الشبكة.");
    } finally {
      setSlicing(false);
    }
  };

  const updateCell = (id, patch) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const dataUrlToBlob = (dataUrl) => {
    const [meta, base64Data] = dataUrl.split(",");
    const mime = meta.match(/:(.*?);/)[1];
    const binary = atob(base64Data);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: mime });
  };

  const handleSaveAll = async () => {
    const toSave = cells.filter((c) => c.include && c.name.trim());
    if (toSave.length === 0) {
      alert("سمّ عنصر واحد على الأقل قبل الحفظ.");
      return;
    }
    setSaving(true);

    for (const cell of toSave) {
      const blob = dataUrlToBlob(cell.dataUrl);
      const uniqueName = `${Date.now()}_${cell.name.replace(/\s+/g, "_")}.png`;
      const storagePath = `game-library/${cell.category}/${uniqueName}`;

      // eslint-disable-next-line no-await-in-loop
      const { error: uploadError } = await supabase.storage
        .from("user-files")
        .upload(storagePath, blob, { contentType: "image/png" });
      if (uploadError) {
        alert(`فشل رفع ${cell.name}: ${uploadError.message}`);
        continue;
      }
      const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);

      // eslint-disable-next-line no-await-in-loop
      await supabase.from("game_items").insert({
        category: cell.category,
        name: cell.name.trim(),
        file_url: publicUrlData.publicUrl,
      });
    }

    setSaving(false);
    alert(`تم حفظ ${toSave.length} عنصر بنجاح في المكتبة الجاهزة.`);
    setCells([]);
    setImgSrc(null);
    setOriginalFile(null);
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-20 text-neutral-500">
        هذي الأداة مخصصة لإدارة المكتبة الجاهزة فقط.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">تقطيع الشبكة (Grid Extractor)</h1>
      <p className="text-neutral-500 text-sm mb-6">
        ارفع سكرين شوت، حدد منطقة الشبكة فقط، والنظام يكتشف حدود كل عنصر تلقائياً بدقة
      </p>

      {!imgSrc ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-neutral-700 rounded-2xl p-10 text-center cursor-pointer bg-neutral-900"
        >
          <p className="text-neutral-400">اضغط لرفع سكرين شوت</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      ) : (
        <>
          <div className="flex gap-3 items-end flex-wrap mb-4">
            <div>
              <label className="text-neutral-400 text-xs block mb-1">حساسية الاكتشاف</label>
              <input
                type="range"
                min={30}
                max={120}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-32"
              />
              <span className="text-neutral-500 text-xs ml-2">{threshold}</span>
            </div>
            <button
              onClick={handleAutoSlice}
              disabled={slicing}
              className="bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {slicing ? "جارِ الاكتشاف..." : "✨ اكتشاف وقص تلقائي"}
            </button>
            <button
              onClick={() => {
                setImgSrc(null);
                setOriginalFile(null);
                setCells([]);
              }}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-xl text-sm transition-colors"
            >
              صورة أخرى
            </button>
          </div>

          <p className="text-neutral-600 text-xs mb-3">
            💡 حرّك واسحب مقابض المستطيل الأصفر ليغطي منطقة الشبكة فقط (المربعات، بدون باقي
            الصورة). النظام بيكتشف حدود كل بطاقة لحالها تلقائياً — ما تحتاج تحدد عدد الصفوف
            أو الأعمدة يدوياً.
          </p>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 overflow-auto">
            <Stage width={image ? image.width * displayScale : 0} height={image ? image.height * displayScale : 0}>
              <Layer>
                {image && (
                  <KonvaImage image={image} width={image.width * displayScale} height={image.height * displayScale} />
                )}
                {rect && (
                  <>
                    <Rect
                      ref={shapeRef}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      stroke="#f59e0b"
                      strokeWidth={2}
                      draggable
                      onDragEnd={(e) => setRect({ ...rect, x: e.target.x(), y: e.target.y() })}
                      onTransformEnd={() => {
                        const node = shapeRef.current;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        node.scaleX(1);
                        node.scaleY(1);
                        setRect({
                          x: node.x(),
                          y: node.y(),
                          width: Math.max(20, node.width() * scaleX),
                          height: Math.max(20, node.height() * scaleY),
                        });
                      }}
                    />
                    <Transformer ref={trRef} rotateEnabled={false} />
                  </>
                )}
              </Layer>
            </Stage>
          </div>

          {cells.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">النتائج ({cells.length} عنصر)</h2>
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  {saving ? "جارِ الحفظ..." : "💾 حفظ الكل بالمكتبة"}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {cells.map((cell) => (
                  <div
                    key={cell.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
                  >
                    <div className="aspect-square transparency-grid flex items-center justify-center">
                      <img src={cell.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="p-2 flex flex-col gap-1.5">
                      <input
                        type="text"
                        placeholder="اسم العنصر (مثلاً M416)"
                        value={cell.name}
                        onChange={(e) => updateCell(cell.id, { name: e.target.value })}
                        className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 outline-none focus:border-amber-500"
                      />
                      <select
                        value={cell.category}
                        onChange={(e) => updateCell(cell.id, { category: e.target.value })}
                        className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 outline-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.key} value={cat.key}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                        <input
                          type="checkbox"
                          checked={cell.include}
                          onChange={(e) => updateCell(cell.id, { include: e.target.checked })}
                          className="accent-amber-500"
                        />
                        تضمين بالحفظ
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
