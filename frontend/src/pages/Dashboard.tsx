import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

// ملاحظة: هذي صفحة Dashboard مبسّطة مؤقتة للتحقق أن تسجيل الدخول يعمل.
// الصفحة الكاملة (صورة شخصية، خطة، رصيد صور، زر Upgrade...) تُبنى بجلسة لاحقة.
export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate("/login");
        return;
      }
      setUser(data.user);
      setLoading(false);
    });
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-black text-neutral-400">
        جارِ التحميل...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black text-neutral-100 flex flex-col items-center justify-center gap-4 px-4">
      <div className="glass rounded-3xl p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-bold mb-2">مرحباً 👋</h1>
        <p className="text-neutral-400 text-sm mb-6">{user?.email}</p>
        <p className="text-neutral-500 text-xs mb-6">
          تسجيل الدخول يعمل بنجاح. لوحة التحكم الكاملة (الخطة، الرصيد، الصورة
          الشخصية) قادمة بجلسة لاحقة.
        </p>
        <button onClick={handleLogout} className="btn-social">
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
