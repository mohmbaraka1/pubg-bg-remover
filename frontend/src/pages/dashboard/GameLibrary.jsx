import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";

const CATEGORIES = [
  { key: "weapons", label: "Weapons", emoji: "🔫", hasTypes: true },
  { key: "vehicles", label: "Vehicles", emoji: "🚗", hasTypes: true },
  { key: "helmets", label: "Helmets", emoji: "⛑", hasTypes: true },
  { key: "backpacks", label: "Backpacks", emoji: "🎒", hasTypes: true },
  { key: "characters", label: "Characters", emoji: "🧍", hasTypes: true },
  { key: "outfits", label: "Outfits", emoji: "👕", hasTypes: false },
  { key: "xsuits", label: "X-Suits", emoji: "🦾", hasTypes: false },
  { key: "frames", label: "Frames", emoji: "🖼", hasTypes: false },
  { key: "emotes", label: "Emotes", emoji: "🕺", hasTypes: false },
  { key: "achievements", label: "Achievements", emoji: "🏆", hasTypes: false },
  { key: "other", label: "Other", emoji: "📦", hasTypes: false },
];

export default function GameLibrary() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeCategory, setActiveCategory] = useState("weapons");
  const [activeType, setActiveType] = useState(null); // null = عرض قائمة الأنواع (المجلدات)
  const [types, setTypes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadTypeId, setUploadTypeId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [thumbnailTargetId, setThumbnailTargetId] = useState(null);
  const fileInputRef = useRef();
  const thumbnailInputRef = useRef();

  const categoryInfo = CATEGORIES.find((c) => c.key === activeCategory);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsAdmin(data.user?.email === ADMIN_EMAIL));
  }, []);

  // جلب "المجلدات" (الأنواع) الخاصة بالفئة النشطة
  useEffect(() => {
    setActiveType(null);
    setSearch("");
    if (!categoryInfo?.hasTypes) {
      setTypes([]);
      return;
    }
    supabase
      .from("asset_types")
      .select("*")
      .eq("category", activeCategory)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setTypes(data || []));
  }, [activeCategory]);

  // جلب العناصر: إما داخل نوع محدد، أو بحث شامل بالفئة، أو فئة بدون أنواع فرعية
  const fetchItems = async () => {
    setLoading(true);
    let query = supabase.from("game_items").select("*").eq("category", activeCategory);

    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    } else if (categoryInfo?.hasTypes && activeType) {
      query = query.eq("type_id", activeType.id);
    } else if (categoryInfo?.hasTypes && !activeType) {
      // بوضع عرض المجلدات، ما نجيب عناصر فردية
      setItems([]);
      setLoading(false);
      return;
    }

    const { data } = await query.order("name", { ascending: true });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeType, search]);

  useEffect(() => {
    if (types.length > 0) setUploadTypeId(types[0].id);
    else setUploadTypeId("");
  }, [types]);

  const handleUpload = async (fileList) => {
    if (!uploadName.trim()) {
      alert("اكتب اسم السكن/العنصر أولاً.");
      return;
    }
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    for (const file of files) {
      const uniqueName = `${Date.now()}_${file.name}`;
      const storagePath = `game-library/${activeCategory}/${uniqueName}`;

      // eslint-disable-next-line no-await-in-loop
      const { error: uploadError } = await supabase.storage.from("user-files").upload(storagePath, file);
      if (uploadError) {
        alert(`فشل الرفع: ${uploadError.message}`);
        continue;
      }
      const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);

      // eslint-disable-next-line no-await-in-loop
      const { error: insertError } = await supabase.from("game_items").insert({
        category: activeCategory,
        name: uploadName.trim(),
        file_url: publicUrlData.publicUrl,
        type_id: categoryInfo?.hasTypes ? uploadTypeId || null : null,
      });
      if (insertError) alert(`فشلت الإضافة لقاعدة البيانات: ${insertError.message}`);
    }
    setUploading(false);
    setUploadName("");
    fetchItems();
  };

  const handleThumbnailUpload = async (file) => {
    if (!file || !thumbnailTargetId) return;
    const uniqueName = `${Date.now()}_${file.name}`;
    const storagePath = `game-library/type-thumbnails/${uniqueName}`;

    const { error: uploadError } = await supabase.storage.from("user-files").upload(storagePath, file);
    if (uploadError) {
      alert(`فشل رفع الصورة: ${uploadError.message}`);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);

    const { error: updateError } = await supabase
      .from("asset_types")
      .update({ thumbnail_url: publicUrlData.publicUrl })
      .eq("id", thumbnailTargetId);
    if (updateError) {
      alert(`فشل تحديث المجلد: ${updateError.message}`);
      return;
    }

    setTypes((prev) =>
      prev.map((t) => (t.id === thumbnailTargetId ? { ...t, thumbnail_url: publicUrlData.publicUrl } : t))
    );
    setThumbnailTargetId(null);
  };

  const handleDelete = async (item) => {
    const path = item.file_url.split("/user-files/")[1];
    if (path) await supabase.storage.from("user-files").remove([path]);
    await supabase.from("game_items").delete().eq("id", item.id);
    fetchItems();
  };

  const showingFolders = categoryInfo?.hasTypes && !activeType && !search.trim();

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
      <h1 className="text-2xl font-bold mb-1">مكتبة العناصر الجاهزة</h1>
      <p className="text-neutral-500 text-sm mb-6">
        ابحث عن أي عنصر بالاسم، أو تصفّح حسب النوع، واستخدمه مباشرة بالتصميم
      </p>

      {/* التصنيفات */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeCategory === cat.key
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-neutral-900 text-neutral-500 border border-neutral-800"
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* مسار التنقل (Breadcrumb) لو داخل نوع معيّن */}
      {categoryInfo?.hasTypes && activeType && (
        <button
          onClick={() => setActiveType(null)}
          className="text-neutral-400 hover:text-neutral-200 text-sm mb-4 flex items-center gap-1"
        >
          ← {categoryInfo.label} / <span className="text-amber-400">{activeType.name}</span>
        </button>
      )}

      {/* البحث */}
      <input
        type="text"
        placeholder={`ابحث بالاسم داخل ${categoryInfo?.label}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 mb-6"
      />

      {/* لوحة الإضافة - تظهر فقط لصاحب الموقع، وبس لما نكون داخل نوع محدد أو فئة بدون أنواع */}
      {isAdmin && (!categoryInfo?.hasTypes || activeType) && (
        <div className="bg-neutral-900 border border-amber-500/30 rounded-xl p-4 mb-6">
          <p className="text-amber-400 text-xs font-medium mb-3">
            🔧 لوحة الإدارة — إضافة{" "}
            {categoryInfo?.hasTypes ? `سكن جديد داخل ${activeType?.name}` : `عنصر جديد لقسم ${categoryInfo?.label}`}
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="اسم السكن (مثلاً Glacier)"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              className="flex-1 min-w-[200px] bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-neutral-100 outline-none focus:border-amber-500"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {uploading ? "جارِ الرفع..." : "+ رفع صورة"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}

      {/* عرض المجلدات (الأنواع) أو العناصر */}
      {showingFolders ? (
        types.length === 0 ? (
          <p className="text-neutral-500 text-sm">لا يوجد أنواع بهذا القسم بعد.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {types.map((t) => (
              <div
                key={t.id}
                className="bg-neutral-900 border border-neutral-800 hover:border-amber-500 rounded-xl overflow-hidden transition-colors relative group"
              >
                <button onClick={() => setActiveType(t)} className="block w-full">
                  <div className="aspect-square flex items-center justify-center bg-neutral-950">
                    {t.thumbnail_url ? (
                      <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-3xl">{categoryInfo.emoji}</span>
                    )}
                  </div>
                  <p className="text-neutral-300 text-xs text-center py-2 truncate px-1">{t.name}</p>
                </button>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setThumbnailTargetId(t.id);
                      thumbnailInputRef.current?.click();
                    }}
                    className="absolute top-1.5 left-1.5 bg-neutral-950/80 text-amber-400 text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    🖼 صورة
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : loading ? (
        <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[35vh] text-center border border-dashed border-neutral-800 rounded-2xl">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-neutral-400 font-medium">
            {search ? "لا توجد نتائج بهذا الاسم" : "لا يوجد عناصر هنا بعد"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden group relative"
            >
              <div className="aspect-square transparency-grid flex items-center justify-center">
                <img src={item.file_url} alt={item.name} className="max-h-full max-w-full object-contain" />
              </div>
              <p className="text-neutral-300 text-xs text-center py-1.5 truncate px-1">{item.name}</p>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(item)}
                  className="absolute top-2 left-2 bg-red-950/80 text-red-300 text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
