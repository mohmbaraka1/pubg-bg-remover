import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Profile() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Profile</h1>
      <p className="text-neutral-500 text-sm mb-6">معلومات حسابك الشخصي</p>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-md">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-2xl font-bold text-neutral-950 mb-4">
          {user?.email?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div>
            <span className="text-neutral-500">البريد الإلكتروني: </span>
            <span className="text-neutral-100">{user?.email}</span>
          </div>
          <div>
            <span className="text-neutral-500">اسم المستخدم: </span>
            <span className="text-neutral-100">
              {user?.user_metadata?.username || "غير محدد"}
            </span>
          </div>
          <div>
            <span className="text-neutral-500">تاريخ الإنشاء: </span>
            <span className="text-neutral-100">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString("ar-EG") : "-"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
