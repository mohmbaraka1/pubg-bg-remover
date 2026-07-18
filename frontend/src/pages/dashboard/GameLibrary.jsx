import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";

const CATEGORIES = [
  { key: "weapons", label: "Weapons", emoji: "🔫" },
  { key: "vehicles", label: "Vehicles", emoji: "🚗" },
  { key: "outfits", label: "Outfits", emoji: "👕" },
  { key: "xsuits", label: "X-Suits", emoji: "🦾" },
  { key: "backpacks", label: "Backpacks", emoji: "🎒" },
  { key: "helmets", label: "Helmets", emoji: "⛑" },
  { key: "frames", label: "Frames", emoji: "🖼" },
  { key: "emotes", label: "Emotes", emoji: "🕺" },
  { key: "other", label: "Other", emoji: "📦" },
];

export default function GameLibrary() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("weapons");
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(data.user?.email === ADMIN_EMAIL);
    });
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase.from("game_items").select("*").eq("category", activeCategory);
    if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
    const { data } = await query.order("name", { ascending: true });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, search]);

  const handleUpload = async (fileList) => {
    if (!uploadName.trim()) {
      alert("اكتب اسم العنصر أولاً (مثلاً M416).");
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
      });
      if (insertError) alert(`فشلت الإضافة لقاعدة البيانات: ${insertError.message}`);
    }
    setUploading(false);
    setUploadName("");
    fetchItems();
  };

  const handleDelete = async (item) => {
    const path = item.file_url.split("/user-files/")[1];
    if (path) await supabase.storage.from("user-files").remove([path]);
    await supabase.from("game_items").delete().eq("id", item.id);
    fetchItems();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">مكتبة العناصر الجاهزة</h1>
      <p className="text-neutral-500 text-sm mb-6">
        ابحث عن أي سلاح أو عنصر بالاسم واستخدمه مباشرة بالتصميم
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

      {/* البحث */}
      <input
        type="text"
        placeholder="اكتب اسم السلاح... مثلاً M416"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 mb-6"
      />

      {/* لوحة الإضافة - تظهر فقط لصاحب الموقع */}
      {isAdmin && (
        <div className="bg-neutral-900 border border-amber-500/30 rounded-xl p-4 mb-6">
          <p className="text-amber-400 text-xs font-medium mb-3">
            🔧 لوحة الإدارة — إضافة عنصر جديد لقسم {CATEGORIES.find((c) => c.key === activeCategory)?.label}
          </p>
          <Link
            to="/dashboard/grid-extractor"
            className="inline-block mb-3 text-xs text-blue-400 hover:underline"
          >
            ✂️ لديك سكرين شوت فيه عدة عناصر بمربعات؟ استخدم أداة تقطيع الشبكة
          </Link>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="اسم العنصر (مثلاً M416)"
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

      {/* الشبكة */}
      {loading ? (
        <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[35vh] text-center border border-dashed border-neutral-800 rounded-2xl">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-neutral-400 font-medium">
            {search ? "لا توجد نتائج بهذا الاسم" : "لا يوجد عناصر بهذا القسم بعد"}
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
