import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva";
import useImage from "use-image";
import { supabase } from "../../lib/supabase";
import { apiUrl } from "../../lib/api";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";
const DISPLAY_MAX_WIDTH = 900;
const GRID_SLICE_API = apiUrl("/api/grid-slice");
const EXTRACT_CUTOUT_API = apiUrl("/api/extract-cutout");

const CATEGORIES = [
  { key: "weapons", label: "Weapons", hasTypes: true },
  { key: "vehicles", label: "Vehicles", hasTypes: true },
  { key: "outfits", label: "Outfits", hasTypes: false },
  { key: "xsuits", label: "X-Suits", hasTypes: false },
  { key: "backpacks", label: "Backpacks", hasTypes: true },
  { key: "helmets", label: "Helmets", hasTypes: true },
  { key: "frames", label: "Frames", hasTypes: false },
  { key: "emotes", label: "Emotes", hasTypes: false },
  { key: "achievements", label: "Achievements", hasTypes: false },
  { key: "mythic_gold", label: "Mythic Gold", hasTypes: false },
  { key: "counter", label: "Counter", hasTypes: false },
  { key: "level", label: "Level", hasTypes: false },
  { key: "other", label: "Other", hasTypes: false },
];

let rectIdCounter = 0;

function RegionRect({ region, isSelected, onSelect, onChange, onDelete }) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Rect
        ref={shapeRef}
        x={region.x}
        y={region.y}
        width={region.width}
        height={region.height}
        stroke={region.color}
        strokeWidth={2}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ ...region, x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...region,
            x: node.x(),
            y: node.y(),
            width: Math.max(20, node.width() * scaleX),
            height: Math.max(20, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer ref={trRef} rotateEnabled={false} onDblClick={onDelete} />
      )}
    </>
  );
}

const REGION_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6", "#06b6d4"];

export default function GridExtractor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [originalFile, setOriginalFile] = useState(null);
  const [imgSrc, setImgSrc] = useState(null);
  const [image] = useImage(imgSrc, "anonymous");
  const [displayScale, setDisplayScale] = useState(1);
  const [regions, setRegions] = useState([]); // مستطيلات متعددة
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [detectionMethod, setDetectionMethod] = useState("projection");
  const [cells, setCells] = useState([]);
  const [typesByCategory, setTypesByCategory] = useState({});
  const [upscaleBeforeSave, setUpscaleBeforeSave] = useState(false);
  const [slicing, setSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === ADMIN_EMAIL));
  }, []);

  useEffect(() => {
    if (image) {
      const scale = Math.min(1, DISPLAY_MAX_WIDTH / image.width);
      setDisplayScale(scale);
      // نبدأ بمستطيل واحد افتراضي، والمستخدم يضيف أكثر لو احتاج
      const initial = {
        id: `region_${rectIdCounter++}`,
        x: image.width * scale * 0.55,
        y: image.height * scale * 0.05,
        width: image.width * scale * 0.4,
        height: image.height * scale * 0.9,
        color: REGION_COLORS[0],
      };
      setRegions([initial]);
      setSelectedRegionId(initial.id);
      setCells([]);
    }
  }, [image]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = () => setImgSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const addRegion = () => {
    if (!image) return;
    const offset = regions.length * 30;
    const newRegion = {
      id: `region_${rectIdCounter++}`,
      x: 40 + offset,
      y: 40 + offset,
      width: image.width * displayScale * 0.3,
      height: image.height * displayScale * 0.3,
      color: REGION_COLORS[regions.length % REGION_COLORS.length],
    };
    setRegions((prev) => [...prev, newRegion]);
    setSelectedRegionId(newRegion.id);
  };

  const updateRegion = (id, newAttrs) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? newAttrs : r)));
  };

  const deleteSelectedRegion = () => {
    if (!selectedRegionId || regions.length <= 1) return; // نبقي مستطيل واحد على الأقل
    setRegions((prev) => prev.filter((r) => r.id !== selectedRegionId));
    setSelectedRegionId(null);
  };

  const deselectOnEmptyClick = (e) => {
    if (e.target === e.target.getStage()) setSelectedRegionId(null);
  };

  const handleAutoSlice = async () => {
    if (!originalFile || regions.length === 0 || !image) return;

    setSlicing(true);
    let allCells = [];

    try {
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        setSliceProgress(`جارِ معالجة المستطيل ${i + 1} من ${regions.length}...`);

        const realX = Math.round(region.x / displayScale);
        const realY = Math.round(region.y / displayScale);
        const realW = Math.round(region.width / displayScale);
        const realH = Math.round(region.height / displayScale);

        const formData = new FormData();
        formData.append("file", originalFile);
        formData.append("rect_x", realX);
        formData.append("rect_y", realY);
        formData.append("rect_w", realW);
        formData.append("rect_h", realH);

        if (detectionMethod === "cutout") {
          // كل مستطيل هون = عنصر واحد كامل (إطار/هاشتاق) يُفرَّغ من خلفيته
          // بالكامل (BiRefNet) - مش شبكة تُقص لخلايا فرعية زي باقي الأوضاع.

          const res = await fetch(EXTRACT_CUTOUT_API, { method: "POST", body: formData });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(`المستطيل ${i + 1}: ${body.detail || `فشل الطلب (HTTP ${res.status})`}`);
          }

          const data = await res.json();
          allCells.push({
            id: `region${i}_cutout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            dataUrl: `data:image/png;base64,${data.image_base64}`,
            name: "",
            category: "frames",
            typeId: "",
            include: true,
          });
          continue;
        }

        formData.append("saturation_threshold", threshold);
        formData.append("method", detectionMethod);


        const res = await fetch(GRID_SLICE_API, { method: "POST", body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`المستطيل ${i + 1}: ${body.detail || `فشل الطلب (HTTP ${res.status})`}`);
        }

        const data = await res.json();

        const regionCells = data.cells.map((c) => ({
          id: `region${i}_cell_${c.row}_${c.col}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: `data:image/png;base64,${c.image_base64}`,
          name: "",
          category: "weapons",
          typeId: "",
          include: true,
        }));
        allCells = [...allCells, ...regionCells];
      }

      if (allCells.length === 0) {
        alert("ما لقيت أي عنصر بالمناطق المحددة. جرب تحرّك المستطيلات أو تعدّل حساسية الاكتشاف.");
        setSlicing(false);
        setSliceProgress("");
        return;
      }

      setCells(allCells);

      const categoriesNeedingTypes = CATEGORIES.filter((c) => c.hasTypes).map((c) => c.key);
      const { data: allTypes } = await supabase
        .from("asset_types")
        .select("*")
        .in("category", categoriesNeedingTypes)
        .order("sort_order", { ascending: true });
      const grouped = {};
      (allTypes || []).forEach((t) => {
        if (!grouped[t.category]) grouped[t.category] = [];
        grouped[t.category].push(t);
      });
      setTypesByCategory(grouped);
    } catch (err) {
      alert(err.message || "فشل تقطيع الشبكة.");
    } finally {
      setSlicing(false);
      setSliceProgress("");
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
      let blob = dataUrlToBlob(cell.dataUrl);

      if (upscaleBeforeSave) {
        try {
          const upscaleForm = new FormData();
          upscaleForm.append("file", blob, "cell.png");

          const upscaleRes = await fetch(apiUrl("/api/upscale"), { method: "POST", body: upscaleForm });
          if (upscaleRes.ok) {
            blob = await upscaleRes.blob();
          } else {
            console.warn(`فشل تكبير ${cell.name}, راح يُحفظ بحجمه الأصلي.`);
          }
        } catch (err) {
          console.warn(`تعذّر تكبير ${cell.name}:`, err);
        }
      }

      const safeName = cell.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
      const uniqueName = `${Date.now()}_${safeName || "item"}.png`;
      const storagePath = `game-library/${cell.category}/${uniqueName}`;


      const { error: uploadError } = await supabase.storage
        .from("user-files")
        .upload(storagePath, blob, { contentType: "image/png" });
      if (uploadError) {
        alert(`فشل رفع ${cell.name}: ${uploadError.message}`);
        continue;
      }
      const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);


      await supabase.from("game_items").insert({
        category: cell.category,
        name: cell.name.trim(),
        file_url: publicUrlData.publicUrl,
        type_id: cell.typeId || null,
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
        ارفع سكرين شوت، حدد منطقة أو أكثر (زي صف الأسلحة وصف السيارات)، والنظام يقصّهم كلهم دفعة واحدة
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
              <label className="text-neutral-400 text-xs block mb-1">طريقة الاكتشاف</label>
              <select
                value={detectionMethod}
                onChange={(e) => setDetectionMethod(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-100 text-sm outline-none"
              >
                <option value="projection">تحليل خطي (الافتراضية)</option>
                <option value="color">ألوان الإطارات (تجريبية)</option>
                <option value="cutout">✂️ تفريغ عنصر مفرد (إطار/هاشتاق)</option>
              </select>
            </div>
            <div>
              <label className="text-neutral-400 text-xs block mb-1">حساسية الاكتشاف</label>
              <input
                type="range"
                min={30}
                max={120}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-32"
                disabled={detectionMethod !== "projection"}
              />
              <span className="text-neutral-500 text-xs ml-2">{threshold}</span>
            </div>
            <button
              onClick={addRegion}
              className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              + إضافة مستطيل
            </button>
            <button
              onClick={deleteSelectedRegion}
              disabled={!selectedRegionId || regions.length <= 1}
              className="bg-red-950 hover:bg-red-900 disabled:opacity-40 text-red-300 px-4 py-2 rounded-xl text-sm transition-colors"
            >
              🗑️ حذف المستطيل المحدد
            </button>
            <button
              onClick={handleAutoSlice}
              disabled={slicing}
              className="bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {slicing ? sliceProgress || "جارِ الاكتشاف..." : `✨ قص كل المستطيلات (${regions.length})`}
            </button>
            <button
              onClick={() => {
                setImgSrc(null);
                setOriginalFile(null);
                setCells([]);
                setRegions([]);
              }}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-xl text-sm transition-colors"
            >
              صورة أخرى
            </button>
          </div>

          <p className="text-neutral-600 text-xs mb-3">
            💡 كل مستطيل بلون مختلف. اضغط «+ إضافة مستطيل» لكل صف عناصر (أسلحة، سيارات، إطارات...)،
            حرّكهم وحجّمهم فوق كل صف، وبعدها اضغط «قص كل المستطيلات» مرة وحدة بس.
          </p>
          {detectionMethod === "cutout" && (
            <p className="text-purple-400 text-xs mb-3">
              ✂️ بوضع «تفريغ عنصر مفرد»: كل مستطيل = عنصر واحد بس (إطار وحد أو هاشتاق وحد) وبيتفرّغ
              بالكامل من خلفيته الفوتوغرافية. لو عندك أكتر من إطار بالصورة، ضيف مستطيل منفصل لكل وحد
              (مو مستطيل واحد يلفّهم كلهم).
            </p>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 overflow-auto">
            <Stage
              width={image ? image.width * displayScale : 0}
              height={image ? image.height * displayScale : 0}
              onMouseDown={deselectOnEmptyClick}
              onTouchStart={deselectOnEmptyClick}
            >
              <Layer>
                {image && (
                  <KonvaImage image={image} width={image.width * displayScale} height={image.height * displayScale} />
                )}
                {regions.map((region) => (
                  <RegionRect
                    key={region.id}
                    region={region}
                    isSelected={region.id === selectedRegionId}
                    onSelect={() => setSelectedRegionId(region.id)}
                    onChange={(newAttrs) => updateRegion(region.id, newAttrs)}
                    onDelete={deleteSelectedRegion}
                  />
                ))}
              </Layer>
            </Stage>
          </div>

          {cells.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-semibold">النتائج ({cells.length} عنصر)</h2>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={upscaleBeforeSave}
                      onChange={(e) => setUpscaleBeforeSave(e.target.checked)}
                      className="accent-amber-500"
                    />
                    🔍 تكبير بالذكاء الاصطناعي قبل الحفظ (أبطأ شوي)
                  </label>
                  <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                  >
                    {saving ? "جارِ الحفظ..." : "💾 حفظ الكل بالمكتبة"}
                  </button>
                </div>
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
                        onChange={(e) =>
                          updateCell(cell.id, { category: e.target.value, typeId: "" })
                        }
                        className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 outline-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat.key} value={cat.key}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                      {CATEGORIES.find((c) => c.key === cell.category)?.hasTypes && (
                        <select
                          value={cell.typeId}
                          onChange={(e) => updateCell(cell.id, { typeId: e.target.value })}
                          className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-xs text-neutral-100 outline-none"
                        >
                          <option value="">— اختر النوع —</option>
                          {(typesByCategory[cell.category] || []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      )}
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
