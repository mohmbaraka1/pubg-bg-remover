import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// props فقط للتحكم بحالة الفتح/الإغلاق عالجوال (drawer) - عالشاشات الكبيرة
// (md وفوق) الشريط ثابت دايماً زي ما كان، هاي props ما إلها أثر إطلاقاً.

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠", end: true },
  { to: "/dashboard/accounts", label: "My Accounts", icon: "📂" },
  { to: "/dashboard/resources", label: "Design Resources", icon: "🎨" },
  { to: "/dashboard/game-library", label: "Game Library", icon: "🔫" },
  { to: "/dashboard/grid-extractor", label: "Grid Extractor", icon: "✂️" },
  { to: "/dashboard/template-editor", label: "Template Editor", icon: "🧩" },
  { to: "/dashboard/template-library", label: "Template Library", icon: "📚" },
  { to: "/dashboard/image-editor", label: "Image Editor", icon: "🖌" },
  { to: "/dashboard/upgrade", label: "الترقية لـ Pro", icon: "⭐" },
  { to: "/dashboard/ai-assets", label: "AI Assets", icon: "🖼", badge: "Soon" },
  { to: "/dashboard/studio", label: "Design Studio", icon: "✨" },
  { to: "/dashboard/history", label: "History", icon: "📜" },
  { to: "/dashboard/favorites", label: "Favorites", icon: "⭐" },
];

const BOTTOM_ITEMS = [
  { to: "/dashboard/settings", label: "Settings", icon: "⚙" },
  { to: "/dashboard/profile", label: "Profile", icon: "👤" },
];

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      isActive
        ? "bg-amber-500/15 text-amber-400"
        : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60"
    }`;

  return (
    <>
      {/* خلفية معتمة عالجوال بس، تسكّر الشريط لما تدوس برا منه */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* عالجوال: شريط منزلق (drawer) فوق المحتوى، مخفي افتراضياً برا الشاشة.
          من md وفوق: شريط ثابت دايماً بنفس السلوك القديم بالضبط. */}
      <aside
        className={`w-64 shrink-0 h-screen fixed md:sticky top-0 z-50 bg-neutral-950 border-r border-neutral-800 flex flex-col py-6 px-3 transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } start-auto end-0 md:start-0 md:end-auto`}
      >
        <div className="flex items-center justify-between px-3 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-neutral-950 font-bold text-sm">
              BG
            </div>
            <span className="font-bold text-neutral-100 text-sm">Background Remover</span>
          </div>
          <button
            onClick={onClose}
            className="md:hidden text-neutral-400 hover:text-neutral-100 text-xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="إغلاق القائمة"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={onClose}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-1 pt-4 border-t border-neutral-800 shrink-0">
          {BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={onClose}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </NavLink>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-950/40 transition-colors"
          >
            <span>🚪</span>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
