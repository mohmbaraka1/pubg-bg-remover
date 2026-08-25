import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const CATEGORIES = [
  { key: "characters", label: "Characters", emoji: "🧍" },
  { key: "weapons", label: "Weapons", emoji: "🔫" },
  { key: "vehicles", label: "Vehicles", emoji: "🚗" },
  { key: "helmets", label: "Helmets", emoji: "⛑" },
  { key: "backpacks", label: "Backpacks", emoji: "🎒" },
  { key: "frames", label: "Frames", emoji: "🖼" },
];

export default function SmartFillModal({ onClose, onConfirm }) {
  const [tab, setTab] = useState("mine");
  const [activeCategory, setActiveCategory] = useState("characters");
  const [accounts, setAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]); // [{src, category}]

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
    setLoading(true);
    if (tab === "mine") {
      if (!activeAccountId) {
        setItems([]);
        setLoading(false);
        return;
      }
      supabase
        .from("assets")
        .select("*")
        .eq("account_id", activeAccountId)
        .eq("category", activeCategory)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setItems(data || []);
          setLoading(false);
        });
    } else {
      let query = supabase.from("game_items").select("*").eq("category", activeCategory);
      if (search.trim()) query = query.ilike("name", `%${search.trim()}%`);
      query.order("name", { ascending: true }).then(({ data }) => {
        setItems(data || []);
        setLoading(false);
      });
    }
  }, [tab, activeCategory, activeAccountId, search]);

  const isSelected = (item) => selected.some((s) => s.src === item.file_url);

  const toggleSelect = (item) => {
    setSelected((prev) => {
      if (prev.some((s) => s.src === item.file_url)) {
        return prev.filter((s) => s.src !== item.file_url);
      }
      return [...prev, { src: item.file_url, category: activeCategory }];
    });
  };

  const handleConfirm = () => {
    if (selected.length === 0) return;
    onConfirm(selected);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 sm:px-4">
      <div className="bg-neutral-900 border border-neutral-800 sm:rounded-2xl w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div>
            <h2 className="font-bold">⚡ تعبئة ذكية</h2>
            <p className="text-neutral-500 text-xs">
              اختر عدة عناصر، وتتوزع تلقائياً على الأماكن الفاضية المناسبة
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-xl">
            ✕
          </button>
        </div>

        <div className="flex gap-2 p-4 pb-0">
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

        {tab === "mine" && accounts.length > 0 && (
          <div className="flex gap-2 px-4 pt-3 overflow-x-auto">
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
        )}

        {tab === "ready" && (
          <div className="px-4 pt-3">
            <input
              type="text"
              placeholder="ابحث بالاسم..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2 text-neutral-100 outline-none focus:border-amber-500"
            />
          </div>
        )}

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
            <p className="text-neutral-500 text-sm text-center py-10">لا يوجد عناصر بهذا القسم.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleSelect(item)}
                  className={`relative aspect-square bg-neutral-950 border-2 rounded-xl overflow-hidden transparency-grid transition-colors ${
                    isSelected(item) ? "border-amber-500" : "border-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  <img src={item.file_url} alt="" className="w-full h-full object-contain" />
                  {isSelected(item) && (
                    <span className="absolute top-1 left-1 bg-amber-500 text-neutral-950 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {selected.findIndex((s) => s.src === item.file_url) + 1}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-neutral-800">
          <p className="text-neutral-400 text-sm">{selected.length} عنصر محدد</p>
          <button
            onClick={handleConfirm}
            disabled={selected.length === 0}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:bg-neutral-700 text-neutral-950 font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
          >
            ⚡ عبّي الأماكن الفاضية ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
