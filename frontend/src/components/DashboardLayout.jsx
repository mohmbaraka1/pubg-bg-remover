import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
