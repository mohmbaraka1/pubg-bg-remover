import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";

export default function TemplateLibrary() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | ready | empty
  const [isAdmin, setIsAdmin] = useState(false);
  const [thumbnailTargetId, setThumbnailTargetId] = useState(null);
  const thumbnailInputRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === ADMIN_EMAIL));
  }, []);

  useEffect(() => {
    supabase
      .from("design_templates")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTemplates(data || []);
        setLoading(false);
      });
  }, []);

  const [search, setSearch] = useState("");

  const countByType = (placeholders, type) =>
    (placeholders || []).filter((p) => p.type === type).length;

  const filteredTemplates = templates.filter((tpl) => {
    if (search.trim() && !tpl.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    const filledCount = (tpl.placeholders || []).filter((p) => p.default_image_url).length;
    if (filter === "ready") return filledCount > 0;
    if (filter === "empty") return filledCount === 0;
    return true;
  });

  const openInStudio = (templateId) => {
    navigate(`/dashboard/studio?templateId=${templateId}`);
  };

  const handleThumbnailUpload = async (file) => {
    if (!file || !thumbnailTargetId) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `game-library/template-previews/${uniqueName}`;

    const { error: uploadError } = await supabase.storage.from("user-files").upload(storagePath, file);
    if (uploadError) {
      alert(`فشل رفع الصورة: ${uploadError.message}`);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);

    const { error: updateError } = await supabase
      .from("design_templates")
      .update({ thumbnail_url: publicUrlData.publicUrl })
      .eq("id", thumbnailTargetId);
    if (updateError) {
      alert(`فشل التحديث: ${updateError.message}`);
      return;
    }

    setTemplates((prev) =>
      prev.map((t) => (t.id === thumbnailTargetId ? { ...t, thumbnail_url: publicUrlData.publicUrl } : t))
    );
    setThumbnailTargetId(null);
  };

  return (
    <div>
      <input
        ref={thumbnailInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          handleThumbnailUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <h1 className="text-2xl font-bold mb-1">مكتبة التيمبلتات</h1>
      <p className="text-neutral-500 text-sm mb-6">
        كل التصاميم الجاهزة بمكان وحد — شوف عدد الشخصيات بكل تيمبلت قبل ما تفتحه
      </p>

      <input
        type="text"
        placeholder="🔍 ابحث بالاسم..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 mb-4"
      />

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "all" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          الكل ({templates.length})
        </button>
        <button
          onClick={() => setFilter("ready")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "ready" ? "bg-emerald-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          🖼 جاهزة (معبّاة)
        </button>
        <button
          onClick={() => setFilter("empty")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            filter === "empty" ? "bg-blue-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
          }`}
        >
          مربعات فاضية
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
      ) : filteredTemplates.length === 0 ? (
        <p className="text-neutral-500 text-sm">لا يوجد تيمبلتات بهذا التصنيف بعد.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTemplates.map((tpl) => {
            const characterCount = countByType(tpl.placeholders, "character");
            const weaponCount = countByType(tpl.placeholders, "weapon");
            const vehicleCount = countByType(tpl.placeholders, "vehicle");
            const filledCount = (tpl.placeholders || []).filter((p) => p.default_image_url).length;
            const isReady = filledCount > 0;

            return (
              <div
                key={tpl.id}
                className="bg-neutral-900 border border-neutral-800 hover:border-amber-500 rounded-2xl overflow-hidden transition-colors group relative"
              >
                <div className="aspect-video bg-neutral-950 flex items-center justify-center relative">
                  {tpl.thumbnail_url ? (
                    <img src={tpl.thumbnail_url} alt={tpl.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl opacity-30">🧩</span>
                  )}
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setThumbnailTargetId(tpl.id);
                        thumbnailInputRef.current?.click();
                      }}
                      className="absolute top-2 left-2 bg-neutral-950/80 text-amber-400 text-[11px] px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      🖼 تغيير المعاينة
                    </button>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold truncate">{tpl.name}</h3>
                    {isReady && (
                      <span className="shrink-0 text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">
                        🖼 جاهز
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {characterCount > 0 && (
                      <span className="text-[11px] bg-neutral-800 text-neutral-300 px-2 py-1 rounded-lg">
                        🧍 {characterCount} شخصية
                      </span>
                    )}
                    {weaponCount > 0 && (
                      <span className="text-[11px] bg-neutral-800 text-neutral-300 px-2 py-1 rounded-lg">
                        🔫 {weaponCount} سلاح
                      </span>
                    )}
                    {vehicleCount > 0 && (
                      <span className="text-[11px] bg-neutral-800 text-neutral-300 px-2 py-1 rounded-lg">
                        🚗 {vehicleCount} مركبة
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => openInStudio(tpl.id)}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                  >
                    {isReady ? "استخدام / تحرير" : "فتح وتعبئة"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
