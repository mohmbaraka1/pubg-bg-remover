import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const CATEGORIES = [
  { key: "characters", label: "Characters", emoji: "🧍" },
  { key: "outfits", label: "Outfits", emoji: "👕" },
  { key: "xsuits", label: "X-Suits", emoji: "🦾" },
  { key: "weapons", label: "Weapons", emoji: "🔫" },
  { key: "vehicles", label: "Vehicles", emoji: "🚗" },
  { key: "backpacks", label: "Backpacks", emoji: "🎒" },
  { key: "helmets", label: "Helmets", emoji: "⛑" },
  { key: "frames", label: "Frames", emoji: "🖼" },
  { key: "achievements", label: "Achievements", emoji: "🏆" },
  { key: "emotes", label: "Emotes", emoji: "🕺" },
  { key: "planes", label: "Plane Skins", emoji: "✈️" },
  { key: "boats", label: "Boat Skins", emoji: "🚤" },
  { key: "mythic_gold", label: "Mythic Gold", emoji: "👑" },
  { key: "counter", label: "Counter", emoji: "🔢" },
  { key: "level", label: "Level", emoji: "🆙" },
  { key: "other", label: "Other", emoji: "📦" },
];

export default function AccountWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [activeCategory, setActiveCategory] = useState("characters");
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    supabase
      .from("accounts")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setAccount(data);
        setLoading(false);
      });
  }, [id]);

  const fetchAssets = async () => {
    setLoadingAssets(true);
    const { data } = await supabase
      .from("assets")
      .select("*")
      .eq("account_id", id)
      .eq("category", activeCategory)
      .order("created_at", { ascending: false });
    setAssets(data || []);
    setLoadingAssets(false);
  };

  useEffect(() => {
    if (account) fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, activeCategory]);

  const handleDeleteAsset = async (asset) => {
    // نحذف الملف من التخزين والسجل من الجدول معاً
    const path = asset.file_url.split("/user-files/")[1];
    if (path) await supabase.storage.from("user-files").remove([path]);
    await supabase.from("assets").delete().eq("id", asset.id);
    fetchAssets();
  };

  const goToTool = () => {
    navigate(`/app?accountId=${id}&category=${activeCategory}`);
  };

  const goToMultiTool = () => {
    navigate(`/app-multi?accountId=${id}&category=${activeCategory}`);
  };

  if (loading) return <p className="text-neutral-500 text-sm">جارِ التحميل...</p>;

  if (!account) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-400">الحساب غير موجود.</p>
        <Link to="/dashboard/accounts" className="text-amber-400 text-sm hover:underline">
          العودة لـ My Accounts
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/dashboard/accounts" className="text-neutral-500 text-sm hover:text-neutral-300">
        ← My Accounts
      </Link>
      <div className="flex items-center justify-between mt-2 mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{account.name}</h1>
          <p className="text-neutral-500 text-sm">{account.description || "لا يوجد وصف"}</p>
        </div>
        <button
          onClick={goToTool}
          className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + إزالة خلفية وحفظ بـ {CATEGORIES.find((c) => c.key === activeCategory)?.label}
        </button>
        <button
          onClick={goToMultiTool}
          className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          👥 استخراج عدة شخصيات من صورة واحدة
        </button>
      </div>

      {/* تبويبات الفئات */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeCategory === cat.key
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-neutral-900 text-neutral-500 border border-neutral-800 hover:text-neutral-300"
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* شبكة الصور */}
      {loadingAssets ? (
        <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center border border-dashed border-neutral-800 rounded-2xl">
          <div className="text-3xl mb-3">🗂</div>
          <p className="text-neutral-400 font-medium">لا يوجد عناصر بهذا القسم بعد</p>
          <p className="text-neutral-600 text-sm mt-1">استخدم زر «إزالة خلفية» بالأعلى لإضافة أول عنصر</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden group relative"
            >
              <div className="aspect-square transparency-grid flex items-center justify-center">
                <img
                  src={asset.file_url}
                  alt={asset.file_name || ""}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <button
                onClick={() => handleDeleteAsset(asset)}
                className="absolute top-2 left-2 bg-red-950/80 text-red-300 text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
