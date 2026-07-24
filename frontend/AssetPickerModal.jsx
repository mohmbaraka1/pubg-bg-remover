import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const CATEGORIES = [
  { key: "characters", label: "شخصيات", emoji: "🧍" },
  { key: "outfits", label: "لبسات", emoji: "👕" },
  { key: "xsuits", label: "X-Suits", emoji: "🦾" },
  { key: "weapons", label: "أسلحة", emoji: "🔫" },
  { key: "vehicles", label: "مركبات", emoji: "🚗" },
  { key: "backpacks", label: "شنط", emoji: "🎒" },
  { key: "helmets", label: "خوذ", emoji: "⛑" },
  { key: "frames", label: "إطارات", emoji: "🖼" },
  { key: "achievements", label: "إنجازات", emoji: "🏆" },
  { key: "emotes", label: "إيموتس", emoji: "🕺" },
  { key: "planes", label: "طائرات", emoji: "✈️" },
  { key: "boats", label: "قوارب", emoji: "🚤" },
  { key: "other", label: "أخرى", emoji: "📦" },
];

function CategoryTabs({ active, onChange }) {
  const scrollRef = useRef();

  const scrollBy = (amount) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className="relative flex items-center border-b border-neutral-800">
      <button
        onClick={() => scrollBy(-200)}
        className="hidden sm:flex shrink-0 w-8 h-full items-center justify-center text-neutral-500 hover:text-neutral-200 bg-neutral-900 z-10"
        aria-label="تحريك لليمين"
      >
        ‹
      </button>
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto px-2 py-3 flex-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => onChange(cat.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              active === cat.key
                ? "bg-amber-500 text-neutral-950"
                : "bg-neutral-800 text-neutral-400 active:bg-neutral-700"
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => scrollBy(200)}
        className="hidden sm:flex shrink-0 w-8 h-full items-center justify-center text-neutral-500 hover:text-neutral-200 bg-neutral-900 z-10"
        aria-label="تحريك لليسار"
      >
        ›
      </button>
    </div>
  );
}

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
      {accounts.length > 1 && (
        <div className="flex gap-1.5 px-4 pt-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setActiveAccountId(acc.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                activeAccountId === acc.id
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}
            >
              📂 {acc.name}
            </button>
          ))}
        </div>
      )}
      <CategoryTabs active={activeCategory} onChange={setActiveCategory} />
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
                  onSelect(asset.file_url, activeCategory);
                  onClose();
                }}
                className="aspect-square bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden active:border-amber-500 transition-colors transparency-grid"
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
          className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 text-base"
        />
      </div>
      <CategoryTabs active={activeCategory} onChange={setActiveCategory} />
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
                  onSelect(item.file_url, item.category);
                  onClose();
                }}
                className="flex flex-col aspect-square bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden active:border-amber-500 transition-colors transparency-grid"
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
  const [tab, setTab] = useState("mine");

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 sm:px-4">
      <div className="bg-neutral-900 border border-neutral-800 sm:rounded-2xl w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setTab("mine")}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "mine" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              📂 من حسابي
            </button>
            <button
              onClick={() => setTab("ready")}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                tab === "ready" ? "bg-amber-500 text-neutral-950" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              🔍 المكتبة الجاهزة
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 active:text-neutral-100 text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
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
