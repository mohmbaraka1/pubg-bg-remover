import { useRef, useState } from "react";
import ManualEraser from "../../components/ManualEraser";

export default function ImageEditor() {
  const [imageBlob, setImageBlob] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const fileInputRef = useRef();

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageBlob(file);
    setEditorOpen(true);
    e.target.value = "";
  };

  const handleSave = (newBlob) => {
    setImageBlob(newBlob);
    setEditorOpen(false);
    const url = URL.createObjectURL(newBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edited_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">محرر الصور</h1>
      <p className="text-neutral-500 text-sm mb-6">
        ارفع أي صورة (حتى لو من برا الموقع) وعدّل عليها: مسح، تعبئة بلون، أو سحب لون من الصورة نفسها
      </p>

      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-neutral-700 rounded-2xl p-10 text-center cursor-pointer bg-neutral-900 max-w-xl"
      >
        <p className="text-neutral-400">اضغط لرفع صورة (PNG يفضّل لو تبي خلفية شفافة)</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {imageBlob && !editorOpen && (
        <button
          onClick={() => setEditorOpen(true)}
          className="mt-4 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          ✏️ متابعة التعديل
        </button>
      )}

      {editorOpen && imageBlob && (
        <ManualEraser
          beforeUrl={null}
          resultBlob={imageBlob}
          onSave={handleSave}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
