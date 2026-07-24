import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Transformer } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import { supabase } from "../../lib/supabase";
import AssetPickerModal from "../../components/AssetPickerModal";
import BackgroundPickerModal from "../../components/BackgroundPickerModal";
import SmartFillModal from "../../components/SmartFillModal";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const GUIDE_THRESHOLD = 6;

// ============ خطوط المحاذاة الذكية (Smart Guides) ============
function getLineGuideStops(skipId, layers) {
  const vertical = [0, CANVAS_WIDTH / 2, CANVAS_WIDTH];
  const horizontal = [0, CANVAS_HEIGHT / 2, CANVAS_HEIGHT];
  layers.forEach((l) => {
    if (l.id === skipId || l.isBackground) return;
    vertical.push(l.x, l.x + l.width / 2, l.x + l.width);
    horizontal.push(l.y, l.y + l.height / 2, l.y + l.height);
  });
  return { vertical, horizontal };
}

function getObjectSnappingEdges(x, y, width, height) {
  return {
    vertical: [
      { guide: x, offset: 0 },
      { guide: x + width / 2, offset: width / 2 },
      { guide: x + width, offset: width },
    ],
    horizontal: [
      { guide: y, offset: 0 },
      { guide: y + height / 2, offset: height / 2 },
      { guide: y + height, offset: height },
    ],
  };
}

function computeSnapGuides(stops, bounds, threshold = GUIDE_THRESHOLD) {
  const collect = (guideList, boundList) => {
    const found = [];
    guideList.forEach((g) => {
      boundList.forEach((b) => {
        const diff = Math.abs(g - b.guide);
        if (diff < threshold) found.push({ lineGuide: g, offset: b.offset, diff });
      });
    });
    return found.sort((a, b) => a.diff - b.diff)[0];
  };
  const guides = [];
  const v = collect(stops.vertical, bounds.vertical);
  const h = collect(stops.horizontal, bounds.horizontal);
  if (v) guides.push({ orientation: "V", lineGuide: v.lineGuide, offset: v.offset });
  if (h) guides.push({ orientation: "H", lineGuide: h.lineGuide, offset: h.offset });
  return guides;
}

// أنواع الأماكن اللي تحتاج صورة (مو نص، ومو خلفية - تلك لها معاملة خاصة)
const IMAGE_TYPES = new Set([
  "character",
  "weapon",
  "vehicle",
  "helmet",
  "backpack",
  "frame",
  "achievement",
  "emote",
  "logo",
]);

function BackgroundImage({ src, blur, slot }) {
  const [img] = useImage(src, "anonymous");
  const imgRef = useRef();

  useEffect(() => {
    if (imgRef.current && img) {
      const node = imgRef.current;
      node.cache();
      node.filters(blur > 0 ? [Konva.Filters.Blur] : []);
      node.blurRadius(blur);
      node.getLayer()?.batchDraw();
    }
  }, [img, blur]);

  if (!img) return null;
  return (
    <KonvaImage
      ref={imgRef}
      image={img}
      x={slot.x}
      y={slot.y}
      width={slot.width}
      height={slot.height}
      listening={false}
    />
  );
}

function EmptySlot({ slot, onClick }) {
  const labelText = { character: "شخصية", weapon: "سلاح", vehicle: "مركبة", helmet: "خوذة",
    backpack: "شنطة", frame: "إطار", achievement: "إنجاز", emote: "إيموت", logo: "شعار",
    text: "نص", background: "خلفية" }[slot.type] || slot.type;

  return (
    <>
      <Rect
        x={slot.x}
        y={slot.y}
        width={slot.width}
        height={slot.height}
        stroke="#a3a3a3"
        dash={[10, 6]}
        cornerRadius={8}
        onClick={onClick}
        onTap={onClick}
      />
      <Text
        x={slot.x}
        y={slot.y + slot.height / 2 - 20}
        width={slot.width}
        align="center"
        text={`+\n${labelText}`}
        fontSize={16}
        fill="#d4d4d4"
        onClick={onClick}
        onTap={onClick}
        listening
      />
    </>
  );
}

function ImageLayer({ shapeProps, isSelected, onSelect, onChange, onDragMove, onDragEndGuides }) {
  const [img] = useImage(shapeProps.src, "anonymous");
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, shapeProps.width, shapeProps.height, shapeProps.x, shapeProps.y, shapeProps.rotation]);

  // نلائم الصورة داخل حدود مكانها مرة وحدة فقط حسب نوع اللياقة (fitMode)
  useEffect(() => {
    if (img && !shapeProps.fitted) {
      const slotW = shapeProps.slotWidth;
      const slotH = shapeProps.slotHeight;
      const slotX = shapeProps.slotX;
      const slotY = shapeProps.slotY;
      let newW, newH, newX, newY;

      if (shapeProps.fitMode === "height") {
        // الشخصيات: نفس ارتفاع المكان بالضبط، بعرض طبيعي يحافظ على أبعادها
        const aspect = img.width / img.height;
        newH = slotH;
        newW = newH * aspect;
        newX = slotX + (slotW - newW) / 2;
        newY = slotY;
      } else if (shapeProps.fitMode === "stretch") {
        // الخلفية: تملأ المكان بالكامل تماماً
        newW = slotW;
        newH = slotH;
        newX = slotX;
        newY = slotY;
      } else {
        // الأسلحة/المركبات/الإكسسوارات: تلائم داخل المربع بدون تمدد، وتوسّط بداخله
        const scale = Math.min(slotW / img.width, slotH / img.height);
        newW = img.width * scale;
        newH = img.height * scale;
        newX = slotX + (slotW - newW) / 2;
        newY = slotY + (slotH - newH) / 2;
      }

      onChange({ ...shapeProps, width: newW, height: newH, x: newX, y: newY, fitted: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img]);

  return (
    <>
      <KonvaImage
        image={img}
        ref={shapeRef}
        x={shapeProps.x}
        y={shapeProps.y}
        width={shapeProps.width}
        height={shapeProps.height}
        rotation={shapeProps.rotation || 0}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragMove={(e) => onDragMove && onDragMove(shapeProps.id, e.target)}
        onDragEnd={(e) => {
          onDragEndGuides && onDragEndGuides();
          onChange({ ...shapeProps, x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(20, node.width() * scaleX),
            height: Math.max(20, node.height() * scaleY),
            rotation: node.rotation(),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

function TextLayer({ shapeProps, isSelected, onSelect, onChange, onDblClick, onDragMove, onDragEndGuides }) {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected, shapeProps.width, shapeProps.height, shapeProps.x, shapeProps.y, shapeProps.rotation]);

  return (
    <>
      <Text
        ref={shapeRef}
        x={shapeProps.x}
        y={shapeProps.y}
        width={shapeProps.width}
        height={shapeProps.height}
        text={shapeProps.text}
        fontSize={shapeProps.fontSize || 48}
        fill={shapeProps.color || "#ffffff"}
        align="center"
        verticalAlign="middle"
        rotation={shapeProps.rotation || 0}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onDragMove={(e) => onDragMove && onDragMove(shapeProps.id, e.target)}
        onDragEnd={(e) => {
          onDragEndGuides && onDragEndGuides();
          onChange({ ...shapeProps, x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            width: Math.max(40, node.width() * scaleX),
            rotation: node.rotation(),
            fontSize: Math.max(10, (shapeProps.fontSize || 48) * scaleX),
          });
        }}
      />
      {isSelected && <Transformer ref={trRef} rotateEnabled enabledAnchors={["middle-left", "middle-right"]} />}
    </>
  );
}

export default function DesignStudio() {
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [pendingSlot, setPendingSlot] = useState(null);
  const [replaceTargetId, setReplaceTargetId] = useState(null);
  const [freeAddMode, setFreeAddMode] = useState(false);
  const [smartFillOpen, setSmartFillOpen] = useState(false);
  const [bgBlur, setBgBlur] = useState(0);
  const [guideLines, setGuideLines] = useState([]);
  const stageRef = useRef();
  const containerRef = useRef();
  const logoInputRef = useRef();

  useEffect(() => {
    supabase
      .from("design_templates")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTemplates(data || []);
        setLoadingTemplates(false);
      });
  }, []);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      setScale(Math.min(1, containerRef.current.offsetWidth / CANVAS_WIDTH));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [activeTemplate]);

  const applyTemplate = (tpl) => {
    setActiveTemplate(tpl);
    setSelectedId(null);
    const placeholdersList = tpl.placeholders || [];

    // الخانات اللي معاها صورة افتراضية تتعبى تلقائياً (تصميم جاهز)،
    // والباقي يضل فاضي زي المعتاد (يعبّيه المستخدم يدوياً)
    const emptyOnes = placeholdersList.filter((p) => !p.default_image_url);
    const filledOnes = placeholdersList.filter((p) => p.default_image_url);

    setSlots(emptyOnes.map((p) => ({ ...p })));

    const initialLayers = filledOnes.map((p, i) => {
      const fitMode = p.type === "character" ? "height" : p.type === "background" ? "stretch" : "contain";
      return {
        id: `layer_${Date.now()}_${i}`,
        slotId: p.id,
        slotType: p.type,
        src: p.default_image_url,
        fitMode,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        slotX: p.x,
        slotY: p.y,
        slotWidth: p.width,
        slotHeight: p.height,
        rotation: 0,
        fitted: false,
        isBackground: p.type === "background",
      };
    });
    setLayers(initialLayers);
  };

  const fillImageSlot = (src, slot, fitMode) => {
    const id = `layer_${Date.now()}`;
    setLayers((prev) => [
      ...prev,
      {
        id,
        slotId: slot.id,
        slotType: slot.type,
        src,
        fitMode,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        slotX: slot.x,
        slotY: slot.y,
        slotWidth: slot.width,
        slotHeight: slot.height,
        rotation: 0,
        fitted: false,
        isBackground: slot.type === "background",
      },
    ]);
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    setSelectedId(id);
  };

  const fillTextSlot = (slot) => {
    const text = prompt("اكتب النص:", "");
    if (!text) return;
    const id = `layer_${Date.now()}`;
    setLayers((prev) => [
      ...prev,
      {
        id,
        slotId: slot.id,
        isText: true,
        text,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        rotation: 0,
        fontSize: Math.min(48, slot.height * 0.6),
      },
    ]);
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    setSelectedId(id);
  };

  const editTextLayer = (layer) => {
    const text = prompt("عدّل النص:", layer.text);
    if (text === null) return;
    updateLayer(layer.id, { ...layer, text });
  };

  const onSlotClick = (slot) => {
    if (slot.type === "background") {
      setPendingSlot(slot);
      setBgPickerOpen(true);
    } else if (slot.type === "text") {
      fillTextSlot(slot);
    } else if (slot.type === "logo") {
      setPendingSlot(slot);
      logoInputRef.current?.click();
    } else {
      setPendingSlot(slot);
      setPickerOpen(true);
    }
  };

  // يستبدل صورة طبقة موجودة بأخرى، مع إعادة ملاءمتها لنفس ارتفاع/حدود
  // الخانة الأصلية (توحيد الحجم بين كل الشخصيات)، بدل تمديد الصورة الجديدة
  // بالقوة على أبعاد الصورة القديمة بالضبط (قد يكون شكلها الطبيعي مختلف)
  // يصلح أي عنصر تحرّف حجمه (بسحب يدوي سابق مثلاً) بإعادته لحجم خانته الأصلي
  const resetLayerSize = () => {
    if (!selectedId) return;
    setLayers((prev) =>
      prev.map((l) =>
        l.id === selectedId
          ? {
              ...l,
              fitted: false,
              width: l.slotWidth ?? l.width,
              height: l.slotHeight ?? l.height,
              x: l.slotX ?? l.x,
              y: l.slotY ?? l.y,
              rotation: 0,
            }
          : l
      )
    );
  };

  // يوحّد ارتفاع كل الشخصيات دفعة وحدة (يستخدم الارتفاع القياسي 700 المتبع
  // بكل التيمبلتات)، ويحافظ على وقوفها بنفس خط الأرض (الحافة السفلية ثابتة)
  const STANDARD_CHARACTER_HEIGHT = 700;
  const unifyCharacterHeights = () => {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.slotType !== "character") return l;
        const currentBottom = (l.slotY ?? l.y) + (l.slotHeight ?? l.height);
        const newSlotY = currentBottom - STANDARD_CHARACTER_HEIGHT;
        return {
          ...l,
          fitted: false,
          slotHeight: STANDARD_CHARACTER_HEIGHT,
          slotY: newSlotY,
          y: newSlotY,
          height: STANDARD_CHARACTER_HEIGHT,
        };
      })
    );
  };

  const CATEGORY_TO_SLOT_TYPE = {
    characters: "character",
    weapons: "weapon",
    vehicles: "vehicle",
    helmets: "helmet",
    backpacks: "backpack",
    frames: "frame",
  };

  const handleSmartFillConfirm = (selectedItems) => {
    setSmartFillOpen(false);
    setSlots((prevSlots) => {
      let remainingSlots = [...prevSlots];
      const newLayers = [];
      selectedItems.forEach((item, i) => {
        const targetType = CATEGORY_TO_SLOT_TYPE[item.category] || item.category;
        const idx = remainingSlots.findIndex((s) => s.type === targetType);
        if (idx === -1) return; // ما في مكان فاضي مناسب لهالنوع، نتجاهله
        const slot = remainingSlots[idx];
        remainingSlots = remainingSlots.filter((_, si) => si !== idx);
        const fitMode = targetType === "character" ? "height" : "contain";
        newLayers.push({
          id: `layer_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          slotId: slot.id,
          slotType: slot.type,
          src: item.src,
          fitMode,
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
          slotX: slot.x,
          slotY: slot.y,
          slotWidth: slot.width,
          slotHeight: slot.height,
          rotation: 0,
          fitted: false,
          isBackground: false,
        });
      });
      if (newLayers.length > 0) {
        setLayers((prevLayers) => [...prevLayers, ...newLayers]);
      }
      return remainingSlots;
    });
  };

  const replaceLayerImage = (src) => {
    if (!replaceTargetId) return;
    setLayers((prev) =>
      prev.map((l) =>
        l.id === replaceTargetId
          ? {
              ...l,
              src,
              fitted: false,
              width: l.slotWidth ?? l.width,
              height: l.slotHeight ?? l.height,
              x: l.slotX ?? l.x,
              y: l.slotY ?? l.y,
            }
          : l
      )
    );
    setReplaceTargetId(null);
  };

  const startReplace = (layer) => {
    if (layer.isText) return;
    setReplaceTargetId(layer.id);
    if (layer.slotType === "background") {
      setBgPickerOpen(true);
    } else if (layer.slotType === "logo") {
      logoInputRef.current?.click();
    } else {
      setPickerOpen(true);
    }
  };

  const addFreeLayer = (src) => {
    const id = `layer_${Date.now()}`;
    setLayers((prev) => [
      ...prev,
      {
        id,
        src,
        x: 100 + prev.length * 40,
        y: 100 + prev.length * 40,
        width: 300,
        height: 300,
        rotation: 0,
        fitted: true,
      },
    ]);
    setSelectedId(id);
  };

  const handleAssetPicked = (src) => {
    if (freeAddMode) {
      addFreeLayer(src);
      setFreeAddMode(false);
      return;
    }
    if (replaceTargetId) {
      replaceLayerImage(src);
      return;
    }
    if (!pendingSlot) return;
    const fitMode = pendingSlot.type === "character" ? "height" : "contain";
    fillImageSlot(src, pendingSlot, fitMode);
    setPendingSlot(null);
  };

  const handleBackgroundPicked = (src) => {
    if (replaceTargetId) {
      replaceLayerImage(src);
      return;
    }
    if (!pendingSlot) return;
    fillImageSlot(src, pendingSlot, "stretch");
    setPendingSlot(null);
  };

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (replaceTargetId) {
        replaceLayerImage(reader.result);
        return;
      }
      if (!pendingSlot) return;
      fillImageSlot(reader.result, pendingSlot, "contain");
      setPendingSlot(null);
    };
    reader.readAsDataURL(file);
  };

  const handleLayerDragMove = (id, node) => {
    const layer = layers.find((l) => l.id === id);
    if (!layer) return;
    const width = node.width();
    const height = node.height();
    const stops = getLineGuideStops(id, layers);
    const bounds = getObjectSnappingEdges(node.x(), node.y(), width, height);
    const guides = computeSnapGuides(stops, bounds);

    if (guides.length === 0) {
      setGuideLines([]);
      return;
    }
    guides.forEach((g) => {
      if (g.orientation === "V") node.x(g.lineGuide - g.offset);
      else node.y(g.lineGuide - g.offset);
    });
    setGuideLines(
      guides.map((g) =>
        g.orientation === "V"
          ? [g.lineGuide, 0, g.lineGuide, CANVAS_HEIGHT]
          : [0, g.lineGuide, CANVAS_WIDTH, g.lineGuide]
      )
    );
  };

  const clearGuideLines = () => setGuideLines([]);

  const updateLayer = (id, newAttrs) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? newAttrs : l)));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const layer = layers.find((l) => l.id === selectedId);
    setLayers((prev) => prev.filter((l) => l.id !== selectedId));
    if (layer?.slotId && activeTemplate) {
      const original = (activeTemplate.placeholders || []).find((p) => p.id === layer.slotId);
      if (original) setSlots((prev) => [...prev, { ...original }]);
    }
    setSelectedId(null);
  };

  const handleExport = () => {
    const uri = stageRef.current.toDataURL({ pixelRatio: 1 / scale });
    const a = document.createElement("a");
    a.href = uri;
    a.download = `design_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // يحوّل التصميم الحالي (بكل الشخصيات/الأسلحة اللي عبّيتها) إلى تيمبلت
  // جاهز جديد بالكامل، بحيث أي مستخدم يفتحه معبّى تلقائياً ويقدر يستبدل
  const [savingAsReady, setSavingAsReady] = useState(false);

  const handleSaveAsReadyTemplate = async () => {
    const name = prompt("اسم التصميم الجاهز الجديد:", `${activeTemplate?.name || "تصميم"} - جاهز`);
    if (!name || !name.trim()) return;

    setSavingAsReady(true);
    try {
      // كل طبقة معبّاة تتحول لـ Placeholder بصورة افتراضية بنفس مكانها وحجمها
      const filledPlaceholders = layers
        .filter((l) => !l.isText)
        .map((l) => ({
          id: l.slotId || `slot_${l.id}`,
          type: l.slotType || (l.isBackground ? "background" : "other"),
          x: l.slotX ?? l.x,
          y: l.slotY ?? l.y,
          width: l.slotWidth ?? l.width,
          height: l.slotHeight ?? l.height,
          rotation: 0,
          default_image_url: l.src,
        }));

      // أي خانات لسه فاضية بنفس التصميم تبقى فاضية بالتيمبلت الجديد كمان
      const emptyPlaceholders = slots.map((s) => ({ ...s, default_image_url: null }));

      const { data: userData } = await supabase.auth.getUser();

      // نلتقط معاينة مصغّرة من الكانفاس الحالي ونرفعها كـ thumbnail
      let thumbnailUrl = null;
      try {
        const previewUri = stageRef.current.toDataURL({ pixelRatio: 0.25 });
        const previewBlob = await (await fetch(previewUri)).blob();
        const previewPath = `game-library/template-previews/${Date.now()}_preview.png`;
        const { error: previewUploadError } = await supabase.storage
          .from("user-files")
          .upload(previewPath, previewBlob, { contentType: "image/png" });
        if (!previewUploadError) {
          const { data: previewUrlData } = supabase.storage.from("user-files").getPublicUrl(previewPath);
          thumbnailUrl = previewUrlData.publicUrl;
        }
      } catch {
        // لو فشلت المعاينة، نكمل الحفظ بدونها (مو خطأ حرج)
      }

      const { error } = await supabase.from("design_templates").insert({
        name: name.trim(),
        canvas_width: CANVAS_WIDTH,
        canvas_height: CANVAS_HEIGHT,
        placeholders: [...filledPlaceholders, ...emptyPlaceholders],
        owner_id: userData.user?.id,
        is_official: userData.user?.email === "mohammedbaraka842@gmail.com",
        thumbnail_url: thumbnailUrl,
      });

      if (error) {
        alert(`فشل الحفظ: ${error.message}`);
      } else {
        alert("تم حفظ التصميم كتيمبلت جاهز بنجاح! راح يظهر بقائمة التيمبلتات للجميع.");
      }
    } finally {
      setSavingAsReady(false);
    }
  };

  const deselectOnEmptyClick = (e) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  if (loadingTemplates) {
    return <p className="text-neutral-500 text-sm">جارِ التحميل...</p>;
  }

  if (!activeTemplate) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-1">Design Studio</h1>
        <p className="text-neutral-500 text-sm mb-6">اختر تيمبلت جاهز، أو ابدأ من الصفر</p>

        <button
          onClick={() => applyTemplate({ id: "blank", name: "كانفاس فارغ", placeholders: [] })}
          className="w-full mb-6 bg-neutral-900 border-2 border-dashed border-neutral-700 hover:border-amber-500 rounded-2xl p-5 text-center transition-colors"
        >
          <span className="text-2xl">🖌</span>
          <p className="font-semibold mt-1">كانفاس فارغ — ابدأ من الصفر</p>
          <p className="text-neutral-500 text-xs">للمصممين المحترفين: تسحب وترتب كل شي بنفسك</p>
        </button>

        {templates.length === 0 ? (
          <p className="text-neutral-500 text-sm">
            لا يوجد تيمبلتات بعد. أنشئ واحداً من صفحة Template Editor.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {templates.map((tpl) => {
              const filledCount = (tpl.placeholders || []).filter((p) => p.default_image_url).length;
              const totalCount = (tpl.placeholders || []).length;
              const isReady = filledCount > 0;
              return (
                <button
                  key={tpl.id}
                  onClick={() => applyTemplate(tpl)}
                  className="bg-neutral-900 border border-neutral-800 hover:border-amber-500 rounded-2xl overflow-hidden text-start transition-colors"
                >
                  {tpl.thumbnail_url && (
                    <div className="aspect-video bg-neutral-950">
                      <img src={tpl.thumbnail_url} alt={tpl.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold">{tpl.name}</h3>
                      {isReady && (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                          🖼 جاهز
                        </span>
                      )}
                    </div>
                    <p className="text-neutral-500 text-xs">
                      {totalCount} عنصر{isReady ? ` — ${filledCount} معبّى مسبقاً` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const hasBackgroundLayer = layers.some((l) => l.isBackground);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Design Studio</h1>
          <p className="text-neutral-500 text-sm">التيمبلت: {activeTemplate.name}</p>
        </div>
        <button
          onClick={() => setActiveTemplate(null)}
          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2 rounded-xl text-sm transition-colors"
        >
          ↩ تغيير التيمبلت
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        <button
          onClick={() => {
            setFreeAddMode(true);
            setPickerOpen(true);
          }}
          className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + إضافة عنصر حر
        </button>
        <button
          onClick={unifyCharacterHeights}
          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          📏 توحيد ارتفاع كل الشخصيات
        </button>
        <button
          onClick={() => setSmartFillOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          ⚡ تعبئة ذكية
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-3 items-center">
        {hasBackgroundLayer && (
          <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2">
            <span className="text-neutral-400 text-xs">🌫 ضبابية الخلفية</span>
            <input
              type="range"
              min={0}
              max={20}
              value={bgBlur}
              onChange={(e) => setBgBlur(Number(e.target.value))}
              className="w-24 accent-amber-500"
            />
          </div>
        )}
        <button
          onClick={() => {
            const layer = layers.find((l) => l.id === selectedId);
            if (layer) startReplace(layer);
          }}
          disabled={!selectedId || layers.find((l) => l.id === selectedId)?.isText}
          className="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:bg-neutral-700 text-white font-semibold px-3 py-2 rounded-xl text-sm transition-colors"
        >
          🔄 استبدال
        </button>
        <button
          onClick={resetLayerSize}
          disabled={!selectedId}
          className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 px-3 py-2 rounded-xl text-sm transition-colors"
        >
          🔲 إعادة الحجم الافتراضي
        </button>
        <button
          onClick={deleteSelected}
          disabled={!selectedId}
          className="bg-red-950 hover:bg-red-900 disabled:opacity-40 text-red-300 px-3 py-2 rounded-xl text-sm transition-colors"
        >
          🗑️ حذف المحدد (يرجّع المكان فاضي)
        </button>
        <button
          onClick={handleExport}
          className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          تصدير PNG
        </button>
        <button
          onClick={handleSaveAsReadyTemplate}
          disabled={savingAsReady || layers.length === 0}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {savingAsReady ? "جارِ الحفظ..." : "💾 احفظ كتصميم جاهز"}
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleLogoFile}
        />
      </div>

      <p className="text-neutral-600 text-xs mb-3">
        💡 اضغط على أي مكان فارغ (منقّط) لتعبئته من المكتبة المناسبة له تلقائياً.
      </p>

      <div
        ref={containerRef}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 overflow-hidden transparency-grid"
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
            {/* الخلفيات تُرسم أولاً (بالخلف) */}
            {layers
              .filter((l) => l.isBackground)
              .map((l) => (
                <BackgroundImage key={l.id} src={l.src} blur={bgBlur} slot={l} />
              ))}

            {slots.map((slot) => (
              <EmptySlot key={slot.id} slot={slot} onClick={() => onSlotClick(slot)} />
            ))}

            {layers
              .filter((l) => !l.isBackground)
              .map((layer) =>
                layer.isText ? (
                  <TextLayer
                    key={layer.id}
                    shapeProps={layer}
                    isSelected={layer.id === selectedId}
                    onSelect={() => setSelectedId(layer.id)}
                    onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    onDblClick={() => editTextLayer(layer)}
                    onDragMove={handleLayerDragMove}
                    onDragEndGuides={clearGuideLines}
                  />
                ) : (
                  <ImageLayer
                    key={layer.id}
                    shapeProps={layer}
                    isSelected={layer.id === selectedId}
                    onSelect={() => setSelectedId(layer.id)}
                    onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
                    onDragMove={handleLayerDragMove}
                    onDragEndGuides={clearGuideLines}
                  />
                )
              )}

            {guideLines.map((points, i) => (
              <Line key={i} points={points} stroke="#3b82f6" strokeWidth={1.5} dash={[6, 4]} listening={false} />
            ))}
          </Layer>
        </Stage>
      </div>

      {pickerOpen && (
        <AssetPickerModal
          onClose={() => {
            setPickerOpen(false);
            setPendingSlot(null);
            setReplaceTargetId(null);
            setFreeAddMode(false);
          }}
          onSelect={handleAssetPicked}
        />
      )}

      {bgPickerOpen && (
        <BackgroundPickerModal
          onClose={() => {
            setBgPickerOpen(false);
            setPendingSlot(null);
            setReplaceTargetId(null);
          }}
          onSelect={handleBackgroundPicked}
        />
      )}

      {smartFillOpen && (
        <SmartFillModal onClose={() => setSmartFillOpen(false)} onConfirm={handleSmartFillConfirm} />
      )}
    </div>
  );
}
