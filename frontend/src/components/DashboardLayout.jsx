import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* شريط علوي عالجوال بس (md وفوق: الشريط الجانبي ظاهر دايماً أصلاً
            وما في داعي لزر الهامبرغر) */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-neutral-950 border-b border-neutral-800 px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-neutral-300 text-2xl leading-none w-8 h-8 flex items-center justify-center"
            aria-label="فتح القائمة"
          >
            ☰
          </button>
          <span className="font-bold text-sm">Background Remover</span>
        </div>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
