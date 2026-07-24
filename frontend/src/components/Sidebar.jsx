import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: "🏠", end: true },
  { to: "/dashboard/accounts", label: "My Accounts", icon: "📂" },
  { to: "/dashboard/resources", label: "Design Resources", icon: "🎨" },
  { to: "/dashboard/game-library", label: "Game Library", icon: "🔫" },
  { to: "/dashboard/grid-extractor", label: "Grid Extractor", icon: "✂️" },
  { to: "/dashboard/template-editor", label: "Template Editor", icon: "🧩" },
  { to: "/dashboard/image-editor", label: "Image Editor", icon: "🖌" },
  { to: "/dashboard/ai-assets", label: "AI Assets", icon: "🖼", badge: "Soon" },
  { to: "/dashboard/studio", label: "Design Studio", icon: "✨" },
  { to: "/dashboard/history", label: "History", icon: "📜" },
  { to: "/dashboard/favorites", label: "Favorites", icon: "⭐" },
];

const BOTTOM_ITEMS = [
  { to: "/dashboard/settings", label: "Settings", icon: "⚙" },
  { to: "/dashboard/profile", label: "Profile", icon: "👤" },
];

export default function Sidebar() {
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
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-neutral-950 border-r border-neutral-800 flex flex-col py-6 px-3">
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-neutral-950 font-bold text-sm">
          BG
        </div>
        <span className="font-bold text-neutral-100 text-sm">Background Remover</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
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

      <div className="flex flex-col gap-1 pt-4 border-t border-neutral-800">
        {BOTTOM_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
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
  );
}