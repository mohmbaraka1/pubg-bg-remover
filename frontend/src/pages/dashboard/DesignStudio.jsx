import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Text, Transformer } from "react-konva";
import useImage from "use-image";
import AssetPickerModal from "../../components/AssetPickerModal";
import BackgroundPickerModal from "../../components/BackgroundPickerModal";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const SLOT_HEIGHT = 700;
const SIDE_MARGIN = 30;

const TEMPLATES = [
  { id: "free", label: "بدون تيمبلت (حر)", count: null },
  { id: "t3", label: "3 شخصيات", count: 3 },
  { id: "t5", label: "5 شخصيات", count: 5 },
  { id: "t8", label: "8 شخصيات", count: 8 },
  { id: "t10", label: "10 شخصيات", count: 10 },
];

function generateSlots(count) {
  const usableWidth = CANVAS_WIDTH - SIDE_MARGIN * 2;
  const slotWidth = usableWidth / count;
  return Array.from({ length: count }, (_, i) => ({
    id: `slot_${i}`,
    x: SIDE_MARGIN + i * slotWidth,
    y: CANVAS_HEIGHT - SLOT_HEIGHT - 40,
    width: slotWidth,
    height: SLOT_HEIGHT,
  }));
}

// خلفية التصميم - دائماً بالخلف، غير قابلة للسحب أو التحديد
function BackgroundImage({ src }) {
  const [img] = useImage(src, "anonymous");
  if (!img) return null;
  return (
    <KonvaImage image={img} x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} listening={false} />
  );
}

function EmptySlot({ slot, onClick }) {
  return (
    <>
      <Rect
        x={slot.x}
        y={slot.y}
        width={slot.width}
        height={slot.height}
        stroke="#a3a3a3"
        dash={[10, 6]}
        cornerRadius={12}
        onClick={onClick}
        onTap={onClick}
      />
      <Text
        x={slot.x}
        y={slot.y + slot.height / 2 - 20}
        width={slot.width}
        align="center"
        text="+"
        fontSize={40}
        fill="#d4d4d4"
        onClick={onClick}
        onTap={onClick}
        listening
      />
    </>
  );
}

function ImageLayer({ shapeProps, isSelected, onSelect, onChange }) {
  const [img] = useImage(shapeProps.src, "anonymous");
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  useEffect(() => {
    if (img && !shapeProps.fitted) {
      const aspect = img.width / img.height;
      const newHeight = shapeProps.slotHeight || shapeProps.height;
      const newWidth = newHeight * aspect;
      const slotWidth = shapeProps.slotWidth || shapeProps.width;
      const centeredX = (shapeProps.slotX ?? shapeProps.x) + (slotWidth - newWidth) / 2;
      onChange({ ...shapeProps, width: newWidth, height: newHeight, x: centeredX, fitted: true });
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
        onDragEnd={(e) => onChange({ ...shapeProps, x: e.target.x(), y: e.target.y() })}
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

export default function DesignStudio() {
  const [backgroundSrc, setBackgroundSrc] = useState(null);
  const [activeTemplateId, setActiveTemplateId] = useState("free");
  const [slots, setSlots] = useState([]);
  const [layers, setLayers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [pendingSlotId, setPendingSlotId] = useState(null);
  const stageRef = useRef();
  const containerRef = useRef();
  const fileInputRef = useRef();

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      setScale(Math.min(1, containerRef.current.offsetWidth / CANVAS_WIDTH));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const applyTemplate = (templateId) => {
    setActiveTemplateId(templateId);
    setLayers([]);
    setSelectedId(null);
    const template = TEMPLATES.find((t) => t.id === templateId);
    setSlots(template.count ? generateSlots(template.count) : []);
  };

  const fillSlot = (src, slotId) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    const id = `layer_${Date.now()}`;
    setLayers((prev) => [
      ...prev,
      {
        id,
        slotId,
        src,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        slotX: slot.x,
        slotWidth: slot.width,
        slotHeight: slot.height,
        rotation: 0,
        fitted: false,
      },
    ]);
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    setSelectedId(id);
  };

  const addFreeLayer = (src) => {
    const id = `layer_${Date.now()}`;
    setLayers((prev) => [
      ...prev,
      { id, src, x: 100 + prev.length * 60, y: 150, width: 300, height: 300, rotation: 0, fitted: true },
    ]);
    setSelectedId(id);
  };

  const handlePickerSelect = (src) => {
    if (pendingSlotId) {
      fillSlot(src, pendingSlotId);
      setPendingSlotId(null);
    } else {
      addFreeLayer(src);
    }
  };

  const onSlotClick = (slotId) => {
    setPendingSlotId(slotId);
    setPickerOpen(true);
  };

  const onFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (pendingSlotId) {
          fillSlot(reader.result, pendingSlotId);
          setPendingSlotId(null);
        } else {
          addFreeLayer(reader.result);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const updateLayer = (id, newAttrs) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? newAttrs : l)));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const layer = layers.find((l) => l.id === selectedId);
    setLayers((prev) => prev.filter((l) => l.id !== selectedId));
    if (layer?.slotId) {
      setSlots((prev) => [
        ...prev,
        { id: layer.slotId, x: layer.slotX, y: layer.y, width: layer.slotWidth, height: layer.slotHeight },
      ]);
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

  const deselectOnEmptyClick = (e) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Design Studio</h1>
        <p className="text-neutral-500 text-sm">
          قياس البطاقة: {CANVAS_WIDTH}×{CANVAS_HEIGHT}
        </p>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => applyTemplate(t.id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTemplateId === t.id
                ? "bg-amber-500 text-neutral-950"
                : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        <button
          onClick={() => setBgPickerOpen(true)}
          className="bg-purple-500 hover:bg-purple-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          🖼 اختر خلفية
        </button>
        {backgroundSrc && (
          <button
            onClick={() => setBackgroundSrc(null)}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-2 rounded-xl text-sm transition-colors"
          >
            إزالة الخلفية
          </button>
        )}
        {activeTemplateId === "free" && (
          <>
            <button
              onClick={() => {
                setPendingSlotId(null);
                setPickerOpen(true);
              }}
              className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              📂 إضافة من المكتبة
            </button>
            <button
              onClick={() => {
                setPendingSlotId(null);
                fileInputRef.current?.click();
              }}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              + رفع من الجهاز
            </button>
          </>
        )}
        <button
          onClick={deleteSelected}
          disabled={!selectedId}
          className="bg-red-950 hover:bg-red-900 disabled:opacity-40 text-red-300 px-3 py-2 rounded-xl text-sm transition-colors"
        >
          🗑️ حذف المحدد
        </button>
        <button
          onClick={handleExport}
          disabled={layers.length === 0 && !backgroundSrc}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          تصدير PNG
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={onFileInputChange}
        />
      </div>

      {activeTemplateId !== "free" && (
        <p className="text-neutral-600 text-xs mb-3">
          💡 اضغط على أي خانة فارغة (المنقّطة) لملئها بشخصية من مكتبتك أو من جهازك.
        </p>
      )}

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
            {backgroundSrc && <BackgroundImage src={backgroundSrc} />}
            {slots.map((slot) => (
              <EmptySlot key={slot.id} slot={slot} onClick={() => onSlotClick(slot.id)} />
            ))}
            {layers.map((layer) => (
              <ImageLayer
                key={layer.id}
                shapeProps={layer}
                isSelected={layer.id === selectedId}
                onSelect={() => setSelectedId(layer.id)}
                onChange={(newAttrs) => updateLayer(layer.id, newAttrs)}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      {pickerOpen && (
        <AssetPickerModal
          onClose={() => {
            setPickerOpen(false);
            setPendingSlotId(null);
          }}
          onSelect={handlePickerSelect}
        />
      )}

      {bgPickerOpen && (
        <BackgroundPickerModal onClose={() => setBgPickerOpen(false)} onSelect={setBackgroundSrc} />
      )}
    </div>
  );
}
