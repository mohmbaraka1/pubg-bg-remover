import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function AccountWorkspace() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <p className="text-neutral-500 text-sm">جارِ التحميل...</p>;
  }

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
      <h1 className="text-2xl font-bold mt-2 mb-1">{account.name}</h1>
      <p className="text-neutral-500 text-sm mb-8">{account.description || "لا يوجد وصف"}</p>

      <div className="flex flex-col items-center justify-center h-[45vh] text-center border border-dashed border-neutral-800 rounded-2xl">
        <div className="text-3xl mb-3">🗂</div>
        <p className="text-neutral-400 font-medium">مكتبات الحساب (شخصيات، أسلحة، مركبات...)</p>
        <p className="text-neutral-600 text-sm mt-1">قادمة بجلسة لاحقة</p>
      </div>
    </div>
  );
}
