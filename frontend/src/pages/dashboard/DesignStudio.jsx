import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

// عدّاد وحدة بدل Date.now() لتوليد id فريد للعناصر - نفس الغرض (فريد
// بكل جلسة) بدون استدعاء دالة غير نقية (impure) وقت الرندر.
let idCounter = 0;
const nextId = () => idCounter++;

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

// كل نوع خانة إله أيقونة تعبيرية مميزة + شكل حواف مختلف (شارة دائرية، إطار
// حاد الزوايا...) - عشان الخانة الفاضية توحي بشكل العنصر الحقيقي من أول
// وهلة بدل مربع لون موحّد لكل الأنواع (كانت كلها متشابهة شكلاً بغض النظر
// عن نوع العنصر). لسا خانة فاضية وقابلة للضغط لاستدعاء منتقي الصور - الشكل
// الحقيقي 100% بيجي بعد ما يختار المستخدم الصورة (ImageLayer).
const TYPE_EMOJI = {
  character: "🧍", weapon: "🔫", vehicle: "🚗", helmet: "⛑",
  backpack: "🎒", frame: "🖼", achievement: "🏆", emote: "🕺",
  logo: "⭐", mythic_gold: "👑", counter: "🔢", level: "🆙", other: "📦",
};

// شارات/عدادات مربعة صغيرة تُعامل كـ"شارة دائرية الشكل"، الإطار حاد الزوايا
// (يشبه إطار صورة حقيقي)، والباقي متوسط الاستدارة كالمعتاد.
const TYPE_CORNER_RADIUS = (slot) => {
  if (slot.type === "frame") return 4;
  if (["achievement", "mythic_gold", "counter", "level"].includes(slot.type)) {
    return Math.min(slot.width, slot.height) / 2;
  }
  return 14;
};

function EmptySlot({ slot, onClick }) {
  const labelText = { character: "شخصية", weapon: "سلاح", vehicle: "مركبة", helmet: "خوذة",
    backpack: "شنطة", frame: "إطار", achievement: "إنجاز", emote: "إيموت", logo: "شعار",
    mythic_gold: "ميثك ذهبي", counter: "عداد", level: "لفل",
    text: "نص", background: "خلفية" }[slot.type] || slot.type;
  const emoji = TYPE_EMOJI[slot.type] || "📦";
  const cornerRadius = TYPE_CORNER_RADIUS(slot);
  const emojiSize = Math.min(slot.width, slot.height) * 0.45;

  return (
    <>
      <Rect
        x={slot.x}
        y={slot.y}
        width={slot.width}
        height={slot.height}
        fill="rgba(245, 158, 11, 0.06)"
        stroke="rgba(245, 158, 11, 0.35)"
        strokeWidth={1.5}
        cornerRadius={cornerRadius}
        onClick={onClick}
        onTap={onClick}
      />
      <Text
        x={slot.x}
        y={slot.y + slot.height / 2 - emojiSize / 2 - 14}
        width={slot.width}
        align="center"
        text={emoji}
        fontSize={emojiSize}
        opacity={0.5}
        onClick={onClick}
        onTap={onClick}
        listening
      />
      <Rect
        x={slot.x + slot.width / 2 - 20}
        y={slot.y + slot.height / 2 + emojiSize / 2 - 14}
        width={40}
        height={40}
        fill="rgba(245, 158, 11, 0.2)"
        cornerRadius={20}
        onClick={onClick}
        onTap={onClick}
        listening
      />
      <Text
        x={slot.x + slot.width / 2 - 20}
        y={slot.y + slot.height / 2 + emojiSize / 2 - 27}
        width={40}
        align="center"
        text="+"
        fontSize={24}
        fontStyle="bold"
        fill="#f59e0b"
        onClick={onClick}
        onTap={onClick}
        listening
      />
      <Text
        x={slot.x}
        y={slot.y + slot.height / 2 + emojiSize / 2 + 20}
        width={slot.width}
        align="center"
        text={labelText}
        fontSize={13}
        fill="#a3a3a3"
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
  const [searchParams] = useSearchParams();
  const templateIdFromUrl = searchParams.get("templateId");
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
  const [smartFillMode, setSmartFillMode] = useState("fill"); // "fill" | "ai"
  const [bgBlur, setBgBlur] = useState(0);
  const [guideLines, setGuideLines] = useState([]);
  const [rulers, setRulers] = useState([]); // مساطر ثابتة يضيفها المستخدم يدوياً للموازنة
  const stageRef = useRef();
  const containerRef = useRef();
  const overlayLayerRef = useRef();
  const logoInputRef = useRef();

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
        id: `layer_${nextId()}_${i}`,
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
        rotation: p.rotation || 0,
        fitted: true, // نثق بالحجم/الموضع المحفوظ بالضبط - ما نعيد حسابه
        isBackground: p.type === "background",
      };
    });
    setLayers(initialLayers);
  };

  useEffect(() => {
    supabase
      .from("design_templates")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = data || [];
        setTemplates(list);
        setLoadingTemplates(false);
        if (templateIdFromUrl) {
          const match = list.find((t) => t.id === templateIdFromUrl);
          if (match) applyTemplate(match);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const fillImageSlot = (src, slot, fitMode) => {
    const id = `layer_${nextId()}`;
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
    if (slot.type === "character") {
      unifyCharacterHeights();
    }
  };

  const fillTextSlot = (slot) => {
    const text = prompt("اكتب النص:", "");
    if (!text) return;
    const id = `layer_${nextId()}`;
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

  // يوحّد ارتفاع كل الشخصيات دفعة وحدة، ويحافظ على وقوفها بنفس خط الأرض
  const unifyCharacterHeights = () => {
    setLayers((prev) => {
      const characterLayers = prev.filter((l) => l.slotType === "character");
      if (characterLayers.length === 0) return prev;

      // نحدد الارتفاع المرجعي من التصميم الحالي نفسه (أكثر ارتفاع متكرر بين
      // الشخصيات الموجودة) بدل رقم ثابت قد لا يناسب كل تيمبلت (بعض
      // التيمبلتات المستوردة من صور مرجعية أماكنها أصغر من 700 مثلاً)
      const heights = characterLayers.map((l) => Math.round(l.slotHeight ?? l.height));
      const counts = {};
      heights.forEach((h) => (counts[h] = (counts[h] || 0) + 1));
      const targetHeight = Number(
        Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      );

      return prev.map((l) => {
        if (l.slotType !== "character") return l;
        const currentBottom = (l.slotY ?? l.y) + (l.slotHeight ?? l.height);
        const newSlotY = currentBottom - targetHeight;
        return {
          ...l,
          fitted: false,
          slotHeight: targetHeight,
          slotY: newSlotY,
          y: newSlotY,
          height: targetHeight,
        };
      });
    });
  };

  const CATEGORY_TO_SLOT_TYPE = {
    characters: "character",
    weapons: "weapon",
    vehicles: "vehicle",
    helmets: "helmet",
    backpacks: "backpack",
    frames: "frame",
    mythic_gold: "mythic_gold",
    counter: "counter",
    level: "level",
  };

  // "تصميم بالذكاء الاصطناعي": يختار المستخدم عناصر بأعداد حرة (شخصيات،
  // أسلحة، سيارات...)، والنظام يولّد ترتيب كامل تلقائياً بصيغة صف أيقونات
  // فوق + صف شخصيات بالنص (نفس أسلوب بطاقات العرض الاحترافية) ويعبّيه
  // مباشرة - بدون المرور بخطوة "اختر تيمبلت" منفصلة.
  const CANVAS_W = 1600;
  const CANVAS_H = 900;

  const [pendingAIItems, setPendingAIItems] = useState(null);
  const [layoutChooserOpen, setLayoutChooserOpen] = useState(false);

  const handleAIDesignConfirm = (selectedItems) => {
    setSmartFillOpen(false);
    setPendingAIItems(selectedItems);
    setLayoutChooserOpen(true);
  };

  // يبني التصميم فعلياً بالنمط اللي اختاره المستخدم من بين عدة خيارات تنسيق
  const generateLayoutFromStyle = (style) => {
    const selectedItems = pendingAIItems;
    if (!selectedItems) return;
    setLayoutChooserOpen(false);
    setPendingAIItems(null);

    const characters = selectedItems.filter((i) => i.category === "characters");
    const icons = selectedItems.filter((i) => i.category !== "characters");
    const generatedLayers = [];

    if (style === "split") {
      // نمط "موزّع": نص الأيقونات يسار فوق، ونص يمين فوق (زي بطاقات
      // العرض اللي فيها صف سيارات يمين وصف أسلحة يسار)
      const half = Math.ceil(icons.length / 2);
      const leftIcons = icons.slice(0, half);
      const rightIcons = icons.slice(half);
      const iconSize = 110;
      const gap = 6;

      leftIcons.forEach((item, i) => {
        const x = 20 + i * (iconSize + gap);
        generatedLayers.push({
          id: `ai_icon_l_${i}_${nextId()}`,
          slotType: item.category === "vehicles" ? "vehicle" : "weapon",
          src: item.src,
          fitMode: "contain",
          x, y: 20, width: iconSize, height: iconSize,
          slotX: x, slotY: 20, slotWidth: iconSize, slotHeight: iconSize,
          rotation: 0, fitted: false,
        });
      });
      rightIcons.forEach((item, i) => {
        const x = CANVAS_W - 20 - (i + 1) * (iconSize + gap) + gap;
        generatedLayers.push({
          id: `ai_icon_r_${i}_${nextId()}`,
          slotType: item.category === "vehicles" ? "vehicle" : "weapon",
          src: item.src,
          fitMode: "contain",
          x, y: 20, width: iconSize, height: iconSize,
          slotX: x, slotY: 20, slotWidth: iconSize, slotHeight: iconSize,
          rotation: 0, fitted: false,
        });
      });
    } else if (style === "compact") {
      // نمط "مضغوط": الأيقونات كلها بزاوية علوية يسار، بصفين صغار (يخلي
      // مساحة أكبر للشخصيات)
      const perRow = Math.ceil(icons.length / 2) || 1;
      const iconSize = 90;
      const gap = 5;
      icons.forEach((item, i) => {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const x = 20 + col * (iconSize + gap);
        const y = 20 + row * (iconSize + gap);
        generatedLayers.push({
          id: `ai_icon_c_${i}_${nextId()}`,
          slotType: item.category === "vehicles" ? "vehicle" : "weapon",
          src: item.src,
          fitMode: "contain",
          x, y, width: iconSize, height: iconSize,
          slotX: x, slotY: y, slotWidth: iconSize, slotHeight: iconSize,
          rotation: 0, fitted: false,
        });
      });
    } else {
      // نمط "كلاسيكي" (افتراضي): صف واحد ممتد فوق البطاقة كاملة
      if (icons.length > 0) {
        const margin = 20;
        const gap = 8;
        const usableWidth = CANVAS_W - margin * 2;
        const iconSize = Math.min(150, (usableWidth - gap * (icons.length - 1)) / icons.length);
        icons.forEach((item, i) => {
          const x = margin + i * (iconSize + gap);
          generatedLayers.push({
            id: `ai_icon_${i}_${nextId()}`,
            slotType: item.category === "vehicles" ? "vehicle" : "weapon",
            src: item.src,
            fitMode: "contain",
            x, y: 20, width: iconSize, height: iconSize,
            slotX: x, slotY: 20, slotWidth: iconSize, slotHeight: iconSize,
            rotation: 0, fitted: false,
          });
        });
      }
    }

    // صف الشخصيات بالمنتصف (نفس المنطق بكل الأنماط)
    if (characters.length > 0) {
      const sideMargin = 30;
      const gapBetween = 6;
      const usableWidth = CANVAS_W - sideMargin * 2 - gapBetween * (characters.length - 1);
      const slotWidth = usableWidth / characters.length;
      const charHeight = 700;
      const charY = CANVAS_H - charHeight - 40;
      characters.forEach((item, i) => {
        const x = sideMargin + i * (slotWidth + gapBetween);
        generatedLayers.push({
          id: `ai_char_${i}_${nextId()}`,
          slotType: "character",
          src: item.src,
          fitMode: "height",
          x, y: charY, width: slotWidth, height: charHeight,
          slotX: x, slotY: charY, slotWidth, slotHeight: charHeight,
          rotation: 0, fitted: false,
        });
      });
    }

    setActiveTemplate({ id: "ai-design", name: "تصميم بالذكاء الاصطناعي", placeholders: [] });
    setSlots([{ id: "ai_bg_slot", type: "background", x: 0, y: 0, width: CANVAS_W, height: CANVAS_H }]);
    setLayers(generatedLayers);
    setSelectedId(null);

    // كل شخصية هون بحجم صورتها الأصلية (أبعاد مختلفة تماماً بين وحدة
    // وثانية) - نفس منطق "توحيد ارتفاع كل الشخصيات" الموجود أصلاً (زر
    // يدوي بشريط الأدوات) نطبّقه هون تلقائياً كخطوة أخيرة، بدل ما نخلي
    // المستخدم يضطر يدوس عليه يدوياً كل مرة بعد كل توليد.
    unifyCharacterHeights();
  };

  const handleSmartFillConfirm = (selectedItems) => {
    setSmartFillOpen(false);

    let remainingSlots = [...slots];
    const newLayers = [];
    let filledAnyCharacter = false;

    selectedItems.forEach((item, i) => {
      const targetType = CATEGORY_TO_SLOT_TYPE[item.category] || item.category;
      const idx = remainingSlots.findIndex((s) => s.type === targetType);
      if (idx === -1) return; // ما في مكان فاضي مناسب لهالنوع، نتجاهله
      const slot = remainingSlots[idx];
      remainingSlots = remainingSlots.filter((_, si) => si !== idx);
      const fitMode = targetType === "character" ? "height" : "contain";
      if (targetType === "character") filledAnyCharacter = true;
      newLayers.push({
        id: `layer_${nextId()}_${i}`,
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

    setSlots(remainingSlots);
    if (newLayers.length > 0) {
      setLayers((prev) => [...prev, ...newLayers]);
    }
    if (filledAnyCharacter) {
      unifyCharacterHeights();
    }
  };

  const replaceLayerImage = (src) => {
    if (!replaceTargetId) return;
    const replacedLayer = layers.find((l) => l.id === replaceTargetId);
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
    if (replacedLayer?.slotType === "character") {
      unifyCharacterHeights();
    }
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
    const id = `layer_${nextId()}`;
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

  const addVerticalRuler = () => {
    setRulers((prev) => [...prev, { id: `ruler_${nextId()}`, type: "v", pos: CANVAS_WIDTH / 2 }]);
  };
  const addHorizontalRuler = () => {
    setRulers((prev) => [...prev, { id: `ruler_${nextId()}`, type: "h", pos: CANVAS_HEIGHT / 2 }]);
  };
  const updateRulerPos = (id, pos) => {
    setRulers((prev) => prev.map((r) => (r.id === id ? { ...r, pos } : r)));
  };
  const removeRuler = (id) => {
    setRulers((prev) => prev.filter((r) => r.id !== id));
  };

  const handleExport = () => {
    setSelectedId(null); // نلغي أي تحديد عشان مربع التحكم ما يظهر بالصورة
    overlayLayerRef.current?.hide();
    stageRef.current.batchDraw();
    const uri = stageRef.current.toDataURL({ pixelRatio: 1 / scale });
    overlayLayerRef.current?.show();
    stageRef.current.batchDraw();

    const a = document.createElement("a");
    a.href = uri;
    a.download = `design_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // شعبية التيمبلت (usage_count) - أساس ترتيب التيمبلتات تلقائياً لاحقاً
    // حسب الاستخدام الفعلي بدل رأي شخصي. ما نوقف/ننبّه لو فشلت (مش حرجة).
    if (activeTemplate?.id) {
      supabase.rpc("increment_template_usage", { tpl_id: activeTemplate.id }).then(({ error }) => {
        if (error) console.error("فشل تحديث usage_count:", error);
      });
    }
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
          x: l.x,
          y: l.y,
          width: l.width,
          height: l.height,
          rotation: l.rotation || 0,
          default_image_url: l.src,
        }));

      // أي خانات لسه فاضية بنفس التصميم تبقى فاضية بالتيمبلت الجديد كمان
      const emptyPlaceholders = slots.map((s) => ({ ...s, default_image_url: null }));

      const { data: userData } = await supabase.auth.getUser();

      // نلتقط معاينة مصغّرة من الكانفاس الحالي ونرفعها كـ thumbnail
      let thumbnailUrl = null;
      try {
        overlayLayerRef.current?.hide();
        stageRef.current.batchDraw();
        const previewUri = stageRef.current.toDataURL({ pixelRatio: 0.25 });
        overlayLayerRef.current?.show();
        stageRef.current.batchDraw();
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
        <p className="text-neutral-500 text-sm mb-6">
          اختر <strong className="text-neutral-300">Quick Designer</strong> (قالب جاهز تبدّل عناصره) أو{" "}
          <strong className="text-neutral-300">Pro Designer</strong> (تصميم من الصفر)
        </p>

        <button
          onClick={() => applyTemplate({ id: "blank", name: "كانفاس فارغ", placeholders: [] })}
          className="w-full mb-4 bg-neutral-900 border-2 border-dashed border-neutral-700 hover:border-amber-500 rounded-2xl p-5 text-center transition-colors"
        >
          <span className="text-2xl">🖌</span>
          <p className="font-semibold mt-1">Pro Designer — كانفاس فارغ من الصفر</p>
          <p className="text-neutral-500 text-xs">للمصممين المحترفين: تسحب وترتب كل شي بنفسك</p>
        </button>

        <button
          onClick={() => {
            setSmartFillMode("ai");
            setSmartFillOpen(true);
          }}
          className="w-full mb-6 bg-gradient-to-l from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl p-5 text-center transition-colors"
        >
          <span className="text-2xl">🤖</span>
          <p className="font-semibold mt-1 text-white">توليد سريع بالذكاء الاصطناعي</p>
          <p className="text-purple-100 text-xs">اختر شخصياتك وأسلحتك، ويرتّبهم لك تلقائياً بضغطة وحدة</p>
        </button>

        <p className="text-neutral-600 text-xs mb-3">— أو اختر Quick Designer من التصاميم الجاهزة بالأسفل —</p>

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

        {smartFillOpen && (
          <SmartFillModal
            onClose={() => setSmartFillOpen(false)}
            onConfirm={smartFillMode === "ai" ? handleAIDesignConfirm : handleSmartFillConfirm}
          />
        )}

        {layoutChooserOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6">
              <h2 className="font-bold text-lg mb-1">اختر نمط التنسيق</h2>
              <p className="text-neutral-500 text-sm mb-5">
                نفس العناصر اللي اخترتها، بس بترتيب مختلف — جرب وشوف أي وحدة تعجبك أكثر
              </p>
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => generateLayoutFromStyle("classic")}
                  className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-amber-500 rounded-xl p-4 text-start transition-colors"
                >
                  <p className="font-semibold">📏 كلاسيكي</p>
                  <p className="text-neutral-500 text-xs">صف واحد ممتد للأسلحة/السيارات فوق البطاقة كاملة</p>
                </button>
                <button
                  onClick={() => generateLayoutFromStyle("split")}
                  className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-amber-500 rounded-xl p-4 text-start transition-colors"
                >
                  <p className="font-semibold">↔️ موزّع (يمين ويسار)</p>
                  <p className="text-neutral-500 text-xs">نص الأيقونات يسار فوق، والنص الثاني يمين فوق</p>
                </button>
                <button
                  onClick={() => generateLayoutFromStyle("compact")}
                  className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 hover:border-amber-500 rounded-xl p-4 text-start transition-colors"
                >
                  <p className="font-semibold">📦 مضغوط</p>
                  <p className="text-neutral-500 text-xs">الأيقونات بزاوية علوية يسار بصفين صغار، مساحة أكبر للشخصيات</p>
                </button>
              </div>
              <button
                onClick={() => {
                  setLayoutChooserOpen(false);
                  setPendingAIItems(null);
                }}
                className="w-full mt-4 text-neutral-500 hover:text-neutral-300 text-sm"
              >
                إلغاء
              </button>
            </div>
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
          onClick={() => {
            setSmartFillMode("fill");
            setSmartFillOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          ⚡ تعبئة ذكية
        </button>
        <button
          onClick={addVerticalRuler}
          className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-xl text-sm transition-colors"
        >
          ┃ مسطرة عمودية
        </button>
        <button
          onClick={addHorizontalRuler}
          className="bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-2 rounded-xl text-sm transition-colors"
        >
          ─ مسطرة أفقية
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
          </Layer>

          {/* طبقة أدوات التصميم فقط (الأماكن الفارغة + خطوط المحاذاة) - نخفيها
              مؤقتاً وقت التصدير عشان ما تظهر بالصورة النهائية أبداً */}
          <Layer ref={overlayLayerRef} listening={true}>
            {slots.map((slot) => (
              <EmptySlot key={slot.id} slot={slot} onClick={() => onSlotClick(slot)} />
            ))}
            {guideLines.map((points, i) => (
              <Line key={i} points={points} stroke="#3b82f6" strokeWidth={1.5} dash={[6, 4]} listening={false} />
            ))}
            {rulers.map((r) =>
              r.type === "v" ? (
                <Line
                  key={r.id}
                  points={[0, 0, 0, CANVAS_HEIGHT]}
                  x={r.pos}
                  y={0}
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dash={[4, 4]}
                  draggable
                  dragBoundFunc={(pos) => ({ x: pos.x, y: 0 })}
                  onDragMove={(e) => updateRulerPos(r.id, e.target.x())}
                  onDblClick={() => removeRuler(r.id)}
                  onDblTap={() => removeRuler(r.id)}
                />
              ) : (
                <Line
                  key={r.id}
                  points={[0, 0, CANVAS_WIDTH, 0]}
                  x={0}
                  y={r.pos}
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dash={[4, 4]}
                  draggable
                  dragBoundFunc={(pos) => ({ x: 0, y: pos.y })}
                  onDragMove={(e) => updateRulerPos(r.id, e.target.y())}
                  onDblClick={() => removeRuler(r.id)}
                  onDblTap={() => removeRuler(r.id)}
                />
              )
            )}
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
        <SmartFillModal
          onClose={() => setSmartFillOpen(false)}
          onConfirm={smartFillMode === "ai" ? handleAIDesignConfirm : handleSmartFillConfirm}
        />
      )}
    </div>
  );
}
