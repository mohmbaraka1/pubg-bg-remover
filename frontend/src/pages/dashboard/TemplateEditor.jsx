import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Transformer } from "react-konva";
import { supabase } from "../../lib/supabase";
import AssetPickerModal from "../../components/AssetPickerModal";
import BackgroundPickerModal from "../../components/BackgroundPickerModal";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const DISPLAY_MAX_WIDTH = 900;

const PLACEHOLDER_TYPES = [
  { key: "character", label: "شخصية", color: "#f59e0b", defaultW: 300, defaultH: 700 },
  { key: "weapon", label: "سلاح", color: "#ef4444", defaultW: 150, defaultH: 150 },
  { key: "vehicle", label: "مركبة", color: "#3b82f6", defaultW: 150, defaultH: 150 },
  { key: "helmet", label: "خوذة", color: "#8b5cf6", defaultW: 150, defaultH: 150 },
  { key: "backpack", label: "شنطة", color: "#10b981", defaultW: 150, defaultH: 150 },
  { key: "frame", label: "إطار", color: "#ec4899", defaultW: 150, defaultH: 150 },
  { key: "logo", label: "شعار", color: "#eab308", defaultW: 200, defaultH: 200 },
  { key: "text", label: "نص", color: "#06b6d4", defaultW: 400, defaultH: 80 },
  { key: "background", label: "خلفية", color: "#525252", defaultW: CANVAS_WIDTH, defaultH: CANVAS_HEIGHT },
];

const typeInfo = (key) => PLACEHOLDER_TYPES.find((t) => t.key === key) || PLACEHOLDER_TYPES[0];

function PlaceholderBox({ shape, isSelected, onSelect, onChange }) {
  const shapeRef = useRef();
  const trRef = useRef();
  const info = typeInfo(shape.type);

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
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation || 0}
        fill={info.color}
        opacity={0.35}
        stroke={info.color}
        strokeWidth={2}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ ...shape, x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shape,
            x: node.x(),
            y: node.y(),
            width: Math.max(20, node.width() * scaleX),
            height: Math.max(20, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      />
      <Text
        x={shape.x}
        y={shape.y + 6}
        width={shape.width}
        align="center"
        text={`${info.label}\n${shape.id}${shape.default_image_url ? "\n🖼 معبّى" : ""}`}
        fontSize={14}
        fill="#ffffff"
        listening={false}
      />
      {isSelected && <Transformer ref={trRef} rotateEnabled />}
    </>
  );
}

export default function TemplateEditor() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = مو بوضع تحرير
  const [templateName, setTemplateName] = useState("");
  const [placeholders, setPlaceholders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [defaultImagePickerOpen, setDefaultImagePickerOpen] = useState(null); // "asset" | "background" | null
  const [addType, setAddType] = useState("character");
  const [autoCharCount, setAutoCharCount] = useState(9);
  const [autoWeaponCount, setAutoWeaponCount] = useState(11);
  const [autoFrameCount, setAutoFrameCount] = useState(7);
  const [autoLogo, setAutoLogo] = useState(true);
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef();
  const stageRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === ADMIN_EMAIL));
  }, []);

  const fetchTemplates = async () => {
    setLoadingList(true);
    const { data } = await supabase
      .from("design_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setTemplates(data || []);
    setLoadingList(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      setScale(Math.min(1, containerRef.current.offsetWidth / CANVAS_WIDTH));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [editingId]);

  const startNewTemplate = () => {
    setEditingId("new");
    setTemplateName("");
    setPlaceholders([]);
    setSelectedId(null);
  };

  const startEditTemplate = (tpl) => {
    setEditingId(tpl.id);
    setTemplateName(tpl.name);
    setPlaceholders(
      (tpl.placeholders || []).map((p, i) => ({
        ...p,
        _localId: `${p.id}_${i}`,
      }))
    );
    setSelectedId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPlaceholders([]);
    setSelectedId(null);
  };

  // يولّد تكوين كامل بضغطة واحدة: صف أيقونات فوق + صف شخصيات + صف إطارات تحت
  // (بنفس أسلوب بطاقات عرض الحسابات الاحترافية)
  const handleAutoGenerate = () => {
    const generated = [];

    // 0) مكان الخلفية - يُضاف أولاً (بالخلف) ويغطي البطاقة بالكامل
    generated.push({
      _localId: "auto_background",
      id: "background_1",
      type: "background",
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      rotation: 0,
      z_index: 0,
    });

    // 1) صف الأسلحة/الأيقونات بالأعلى
    if (autoWeaponCount > 0) {
      const rowMargin = 20;
      const gap = 8;
      const usableWidth = CANVAS_WIDTH - rowMargin * 2;
      const iconSize = Math.min(150, (usableWidth - gap * (autoWeaponCount - 1)) / autoWeaponCount);
      for (let i = 0; i < autoWeaponCount; i++) {
        generated.push({
          _localId: `auto_weapon_${i}`,
          id: `weapon_${i + 1}`,
          type: "weapon",
          x: rowMargin + i * (iconSize + gap),
          y: 20,
          width: iconSize,
          height: iconSize,
          rotation: 0,
          z_index: generated.length,
        });
      }
    }

    // 2) صف الشخصيات بالمنتصف (نفس أسلوب generateSlots الحالي)
    if (autoCharCount > 0) {
      const sideMargin = 30;
      const usableWidth = CANVAS_WIDTH - sideMargin * 2;
      const slotWidth = usableWidth / autoCharCount;
      const charHeight = 700;
      const charY = CANVAS_HEIGHT - charHeight - 130; // نرفعها شوي فوق صف الإطارات
      for (let i = 0; i < autoCharCount; i++) {
        generated.push({
          _localId: `auto_char_${i}`,
          id: `character_${i + 1}`,
          type: "character",
          x: sideMargin + i * slotWidth,
          y: charY,
          width: slotWidth,
          height: charHeight,
          rotation: 0,
          z_index: generated.length,
        });
      }
    }

    // 3) الشعار بالمنتصف تماماً (اختياري)
    if (autoLogo) {
      generated.push({
        _localId: "auto_logo",
        id: "logo_1",
        type: "logo",
        x: CANVAS_WIDTH / 2 - 100,
        y: CANVAS_HEIGHT / 2 - 100,
        width: 200,
        height: 200,
        rotation: 0,
        z_index: generated.length,
      });
    }

    // 4) صف الإطارات بالأسفل
    if (autoFrameCount > 0) {
      const rowMargin = 20;
      const gap = 10;
      const usableWidth = CANVAS_WIDTH - rowMargin * 2;
      const frameSize = Math.min(120, (usableWidth - gap * (autoFrameCount - 1)) / autoFrameCount);
      const frameY = CANVAS_HEIGHT - frameSize - 15;
      for (let i = 0; i < autoFrameCount; i++) {
        generated.push({
          _localId: `auto_frame_${i}`,
          id: `frame_${i + 1}`,
          type: "frame",
          x: rowMargin + i * (frameSize + gap),
          y: frameY,
          width: frameSize,
          height: frameSize,
          rotation: 0,
          z_index: generated.length,
        });
      }
    }

    setPlaceholders(generated);
    setSelectedId(null);
  };

  const addPlaceholder = () => {
    const info = typeInfo(addType);
    const countOfType = placeholders.filter((p) => p.type === addType).length;
    const newPlaceholder = {
      _localId: `local_${Date.now()}`,
      id: `${addType}_${countOfType + 1}`,
      type: addType,
      x: addType === "background" ? 0 : 60 + countOfType * 30,
      y: addType === "background" ? 0 : 60 + countOfType * 30,
      width: info.defaultW,
      height: info.defaultH,
      rotation: 0,
      z_index: placeholders.length,
    };
    // الخلفية دائماً بالخلف (أول عنصر بالمصفوفة)
    if (addType === "background") {
      setPlaceholders((prev) => [newPlaceholder, ...prev]);
    } else {
      setPlaceholders((prev) => [...prev, newPlaceholder]);
    }
  };

  const updatePlaceholder = (localId, newAttrs) => {
    setPlaceholders((prev) => prev.map((p) => (p._localId === localId ? newAttrs : p)));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setPlaceholders((prev) => prev.filter((p) => p._localId !== selectedId));
    setSelectedId(null);
  };

  const bringToFront = () => {
    if (!selectedId) return;
    setPlaceholders((prev) => {
      const item = prev.find((p) => p._localId === selectedId);
      const rest = prev.filter((p) => p._localId !== selectedId);
      return [...rest, item];
    });
  };

  const [importing, setImporting] = useState(false);
  const referenceInputRef = useRef();

  const handleImportReference = async (file) => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/detect-full-layout", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `فشل الكشف (HTTP ${res.status})`);
      }
      const data = await res.json();
      const { image_width, image_height, characters, top_cells, bottom_cells } = data;

      if ((!characters || characters.length === 0) && (!top_cells || top_cells.length === 0)) {
        alert("ما قدر يكتشف أي عنصر بهالصورة. جرب صورة أوضح.");
        return;
      }

      const scaleX = CANVAS_WIDTH / image_width;
      const scaleY = CANVAS_HEIGHT / image_height;
      const generated = [];

      (characters || []).forEach((b, i) => {
        generated.push({
          _localId: `imported_char_${i}_${Date.now()}`,
          id: `character_${i + 1}`,
          type: "character",
          x: Math.round(b.x1 * scaleX),
          y: Math.round(b.y1 * scaleY),
          width: Math.round((b.x2 - b.x1) * scaleX),
          height: Math.round((b.y2 - b.y1) * scaleY),
          rotation: 0,
          z_index: i,
        });
      });

      // خلايا الشبكة فوق الشخصيات - نفترضها أسلحة/سيارات (نوع "weapon" افتراضياً)
      (top_cells || []).forEach((c, i) => {
        generated.push({
          _localId: `imported_top_${i}_${Date.now()}`,
          id: `weapon_${i + 1}`,
          type: "weapon",
          x: Math.round(c.x * scaleX),
          y: Math.round(c.y * scaleY),
          width: Math.round(c.w * scaleX),
          height: Math.round(c.h * scaleY),
          rotation: 0,
          z_index: 100 + i,
        });
      });

      // خلايا الشبكة تحت الشخصيات - نفترضها إطارات/شارات (نوع "frame" افتراضياً)
      (bottom_cells || []).forEach((c, i) => {
        generated.push({
          _localId: `imported_bottom_${i}_${Date.now()}`,
          id: `frame_${i + 1}`,
          type: "frame",
          x: Math.round(c.x * scaleX),
          y: Math.round(c.y * scaleY),
          width: Math.round(c.w * scaleX),
          height: Math.round(c.h * scaleY),
          rotation: 0,
          z_index: 200 + i,
        });
      });

      setPlaceholders(generated);
      alert(
        `تم اكتشاف ${characters?.length || 0} شخصية، ${top_cells?.length || 0} عنصر بالشبكة العلوية، ` +
        `${bottom_cells?.length || 0} عنصر بالشبكة السفلية!\n\n` +
        `⚠️ العناصر بالشبكة انحطت افتراضياً كـ"سلاح" (فوق) و"إطار" (تحت) - ` +
        `لو فيها سيارات أو أنواع ثانية، حدد العنصر وغيّر نوعه يدوياً قبل الحفظ.`
      );
    } catch (err) {
      alert(err.message || "فشل استيراد الصورة المرجعية.");
    } finally {
      setImporting(false);
    }
  };

  const openDefaultImagePicker = () => {
    if (!selectedId) return;
    const selected = placeholders.find((p) => p._localId === selectedId);
    if (!selected) return;
    if (selected.type === "background") {
      setDefaultImagePickerOpen("background");
    } else {
      setDefaultImagePickerOpen("asset");
    }
  };

  const handleDefaultImagePicked = (src) => {
    if (!selectedId) return;
    setPlaceholders((prev) =>
      prev.map((p) => (p._localId === selectedId ? { ...p, default_image_url: src } : p))
    );
    setDefaultImagePickerOpen(null);
  };

  const clearDefaultImage = () => {
    if (!selectedId) return;
    setPlaceholders((prev) =>
      prev.map((p) => (p._localId === selectedId ? { ...p, default_image_url: null } : p))
    );
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert("اكتب اسم التيمبلت أولاً.");
      return;
    }
    if (placeholders.length === 0) {
      alert("أضف Placeholder واحد على الأقل.");
      return;
    }

    setSaving(true);
    // نحذف الحقل المحلي _localId قبل الحفظ (مو جزء من البنية النهائية)
    const cleanPlaceholders = placeholders.map(({ _localId, ...rest }, index) => ({
      ...rest,
      z_index: index,
    }));

    if (editingId === "new") {
      const { error } = await supabase.from("design_templates").insert({
        name: templateName.trim(),
        canvas_width: CANVAS_WIDTH,
        canvas_height: CANVAS_HEIGHT,
        placeholders: cleanPlaceholders,
      });
      if (error) alert(`فشل الحفظ: ${error.message}`);
    } else {
      const { error } = await supabase
        .from("design_templates")
        .update({ name: templateName.trim(), placeholders: cleanPlaceholders })
        .eq("id", editingId);
      if (error) alert(`فشل الحفظ: ${error.message}`);
    }

    setSaving(false);
    setEditingId(null);
    fetchTemplates();
  };

  const handleDeleteTemplate = async (tpl) => {
    if (!confirm(`حذف تيمبلت "${tpl.name}"؟`)) return;
    await supabase.from("design_templates").delete().eq("id", tpl.id);
    fetchTemplates();
  };

  const deselectOnEmptyClick = (e) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  if (!isAdmin) {
    return <div className="text-center py-20 text-neutral-500">هذي الصفحة مخصصة للإدارة فقط.</div>;
  }

  // ============ وضع القائمة ============
  if (!editingId) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Template Editor</h1>
            <p className="text-neutral-500 text-sm">إنشاء وتعديل تيمبلتات Design Studio</p>
          </div>
          <button
            onClick={startNewTemplate}
            className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            + تيمبلت جديد
          </button>
        </div>

        {loadingList ? (
          <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                <h3 className="font-semibold mb-1">{tpl.name}</h3>
                <p className="text-neutral-500 text-xs mb-3">
                  {(tpl.placeholders || []).length} عنصر · {tpl.canvas_width}×{tpl.canvas_height}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditTemplate(tpl)}
                    className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-2 rounded-xl text-xs transition-colors"
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tpl)}
                    className="px-3 bg-red-950 hover:bg-red-900 text-red-300 py-2 rounded-xl text-xs transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============ وضع التحرير ============
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <input
          type="text"
          placeholder="اسم التيمبلت"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 text-neutral-100 outline-none focus:border-amber-500"
        />
        <div className="flex gap-2">
          <button
            onClick={cancelEdit}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-xl text-sm transition-colors"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {saving ? "جارِ الحفظ..." : "💾 حفظ التيمبلت"}
          </button>
        </div>
      </div>

      <div className="bg-neutral-900 border border-blue-500/30 rounded-xl p-4 mb-4">
        <p className="text-blue-400 text-xs font-medium mb-3">
          🪄 توليد تلقائي — يبني التكوين كامل بضغطة واحدة (زي بطاقات العرض الاحترافية)
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-neutral-400 text-xs block mb-1">عدد الشخصيات</label>
            <input
              type="number"
              min={0}
              max={15}
              value={autoCharCount}
              onChange={(e) => setAutoCharCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-100 outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-400 text-xs block mb-1">عدد الأسلحة/الأيقونات (فوق)</label>
            <input
              type="number"
              min={0}
              max={15}
              value={autoWeaponCount}
              onChange={(e) => setAutoWeaponCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-100 outline-none"
            />
          </div>
          <div>
            <label className="text-neutral-400 text-xs block mb-1">عدد الإطارات (تحت)</label>
            <input
              type="number"
              min={0}
              max={15}
              value={autoFrameCount}
              onChange={(e) => setAutoFrameCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-100 outline-none"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2.5">
            <input
              type="checkbox"
              checked={autoLogo}
              onChange={(e) => setAutoLogo(e.target.checked)}
              className="accent-blue-500"
            />
            شعار بالمنتصف
          </label>
          <button
            onClick={handleAutoGenerate}
            className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            🪄 توليد التكوين
          </button>
        </div>
      </div>

      <div className="bg-neutral-900 border border-purple-500/30 rounded-xl p-4 mb-4">
        <p className="text-purple-400 text-xs font-medium mb-3">
          📷 استيراد صورة مرجعية — يكتشف تلقائياً مكان كل شخصية (بالذكاء الاصطناعي) + شبكات
          الأسلحة/السيارات فوق وتحت (بتحليل الألوان)، بضغطة وحدة
        </p>
        <button
          onClick={() => referenceInputRef.current?.click()}
          disabled={importing}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {importing ? "جارِ الكشف... (قد يأخذ دقيقة)" : "📷 اختر صورة واكتشف الشخصيات"}
        </button>
        <input
          ref={referenceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            handleImportReference(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <span className="text-neutral-500 text-xs">أو أضف عنصر واحد يدوياً:</span>
        <select
          value={addType}
          onChange={(e) => setAddType(e.target.value)}
          className="bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-100 outline-none"
        >
          {PLACEHOLDER_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          onClick={addPlaceholder}
          className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + إضافة Placeholder
        </button>
        <button
          onClick={bringToFront}
          disabled={!selectedId}
          className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-100 px-3 py-2 rounded-xl text-sm transition-colors"
        >
          إلى الأمام
        </button>
        <button
          onClick={openDefaultImagePicker}
          disabled={!selectedId || placeholders.find((p) => p._localId === selectedId)?.type === "text"}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-3 py-2 rounded-xl text-sm transition-colors"
        >
          🖼 صورة افتراضية
        </button>
        <button
          onClick={clearDefaultImage}
          disabled={!selectedId || !placeholders.find((p) => p._localId === selectedId)?.default_image_url}
          className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-400 px-3 py-2 rounded-xl text-sm transition-colors"
        >
          ✕ إزالة الصورة
        </button>
        <button
          onClick={deleteSelected}
          disabled={!selectedId}
          className="bg-red-950 hover:bg-red-900 disabled:opacity-40 text-red-300 px-3 py-2 rounded-xl text-sm transition-colors"
        >
          🗑️ حذف المحدد
        </button>
      </div>

      <div
        ref={containerRef}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 overflow-hidden"
        style={{ touchAction: "none" }}
      >
        <Stage
          ref={stageRef}
          width={CANVAS_WIDTH * scale}
          height={CANVAS_HEIGHT * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={deselectOnEmptyClick}
          onTouchStart={deselectOnEmptyClick}
        >
          <Layer>
            <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#0a0a0a" />
            {placeholders.map((p) => (
              <PlaceholderBox
                key={p._localId}
                shape={p}
                isSelected={p._localId === selectedId}
                onSelect={() => setSelectedId(p._localId)}
                onChange={(newAttrs) => updatePlaceholder(p._localId, newAttrs)}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      <p className="text-neutral-600 text-xs mt-3">
        💡 اختر نوع العنصر وأضفه، اسحبه لمكانه، وغيّر حجمه من المقابض. الألوان بس للتمييز
        بالمحرر، ما راح تظهر بالتصميم النهائي. حدد أي خانة واضغط "🖼 صورة افتراضية" لتجهيز
        تصميم جاهز يفتح معبّى مباشرة للمستخدم (بدل خانة فاضية).
      </p>

      {defaultImagePickerOpen === "asset" && (
        <AssetPickerModal
          onClose={() => setDefaultImagePickerOpen(null)}
          onSelect={handleDefaultImagePicked}
        />
      )}
      {defaultImagePickerOpen === "background" && (
        <BackgroundPickerModal
          onClose={() => setDefaultImagePickerOpen(null)}
          onSelect={handleDefaultImagePicked}
        />
      )}
    </div>
  );
}
