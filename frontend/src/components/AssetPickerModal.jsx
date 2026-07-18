import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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
  { key: "other", label: "Other", emoji: "📦" },
];

function MyLibraryTab({ onSelect, onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [activeCategory, setActiveCategory] = useState("characters");
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("accounts")
      .select("id, name")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setAccounts(data || []);
        if (data && data.length > 0) setActiveAccountId(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!activeAccountId) return;
    setLoading(true);
    supabase
      .from("assets")
      .select("*")
      .eq("account_id", activeAccountId)
      .eq("category", activeCategory)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAssets(data || []);
        setLoading(false);
      });
  }, [activeAccountId, activeCategory]);

  if (accounts.length === 0) {
    return <p className="text-neutral-500 text-sm p-6 text-center">لا يوجد حسابات بعد.</p>;
  }

  return (
    <>
      <div className="flex gap-2 p-4 pb-0 overflow-x-auto">
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => setActiveAccountId(acc.id)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeAccountId === acc.id
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700"
            }`}
          >
            📂 {acc.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2 p-4 pt-3 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeCategory === cat.key ? "bg-neutral-100 text-neutral-950" : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-neutral-500 text-sm text-center py-10">جارِ التحميل...</p>
        ) : assets.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-10">لا يوجد عناصر بهذا القسم.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  onSelect(asset.file_url);
                  onClose();
                }}
                className="aspect-square bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden hover:border-amber-500 transition-colors transparency-grid"
              >
                <img src={asset.file_url} alt="" className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ReadyLibraryTab({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState("weapons");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let query = supabase.from("game_items").select("*").eq("category", activeCategory);
    if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
    query.order("name", { ascending: true }).then(({ data }) => {
      setItems(data || []);
      setLoading(false);
    });
  }, [activeCategory, search]);

  return (
    <>
      <div className="p-4 pb-0">
        <input
          type="text"
          placeholder="ابحث بالاسم... مثلاً M416"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-neutral-100 outline-none focus:border-amber-500"
        />
      </div>
      <div className="flex gap-2 p-4 pt-3 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              activeCategory === cat.key ? "bg-neutral-100 text-neutral-950" : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-neutral-500 text-sm text-center py-10">جارِ التحميل...</p>
        ) : items.length === 0 ? (
          <p className="text-neutral-500 text-sm text-center py-10">لا توجد نتائج.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.file_url);
                  onClose();
                }}
                className="flex flex-col aspect-square bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden hover:border-amber-500 transition-colors transparency-grid"
              >
                <img src={item.file_url} alt={item.name} className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function AssetPickerModal({ onClose, onSelect }) {
  const [tab, setTab] = useState("mine"); // mine | ready

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("mine")}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                tab === "mine" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              📂 من حسابي
            </button>
            <button
              onClick={() => setTab("ready")}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                tab === "ready" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              🔍 المكتبة الجاهزة
            </button>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-xl">
            ✕
          </button>
        </div>

        {tab === "mine" ? (
          <MyLibraryTab onSelect={onSelect} onClose={onClose} />
        ) : (
          <ReadyLibraryTab onSelect={onSelect} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
