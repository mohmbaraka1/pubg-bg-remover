import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const STATUS_LABELS = {
  in_progress: { label: "قيد التجهيز", emoji: "🟢", color: "text-emerald-400 bg-emerald-500/10" },
  designing: { label: "جاري التصميم", emoji: "🎨", color: "text-purple-400 bg-purple-500/10" },
  ready: { label: "جاهز", emoji: "✅", color: "text-blue-400 bg-blue-500/10" },
  sold: { label: "تم البيع", emoji: "💰", color: "text-amber-400 bg-amber-500/10" },
  archived: { label: "مؤرشف", emoji: "📦", color: "text-neutral-400 bg-neutral-500/10" },
};

function AccountModal({ initialData, onClose, onSaved }) {
  const isEdit = Boolean(initialData?.id);
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [status, setStatus] = useState(initialData?.status || "in_progress");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) {
      setError("الرجاء إدخال اسم الحساب.");
      return;
    }
    setSaving(true);
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user.id;

    let saveError;
    if (isEdit) {
      ({ error: saveError } = await supabase
        .from("accounts")
        .update({ name, description, status })
        .eq("id", initialData.id));
    } else {
      ({ error: saveError } = await supabase
        .from("accounts")
        .insert({ name, description, status, user_id: userId }));
    }

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">{isEdit ? "تعديل الحساب" : "حساب جديد"}</h2>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="اسم الحساب"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500"
          />
          <textarea
            placeholder="وصف (اختياري)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 resize-none"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500"
          >
            {Object.entries(STATUS_LABELS).map(([key, v]) => (
              <option key={key} value={key}>
                {v.emoji} {v.label}
              </option>
            ))}
          </select>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={onClose}
              className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 text-neutral-950 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? "جارِ الحفظ..." : "حفظ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalData, setModalData] = useState(null); // null = closed, {} = new, {...} = edit
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error) setAccounts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("accounts").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    fetchAccounts();
  };

  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">My Accounts</h1>
          <p className="text-neutral-500 text-sm">إدارة حسابات PUBG الخاصة بك</p>
        </div>
        <button
          onClick={() => setModalData({})}
          className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + حساب جديد
        </button>
      </div>

      <input
        type="text"
        placeholder="ابحث عن حساب..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 mb-6"
      />

      {loading ? (
        <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[45vh] text-center border border-dashed border-neutral-800 rounded-2xl">
          <div className="text-3xl mb-3">📂</div>
          <p className="text-neutral-400 font-medium">
            {search ? "لا توجد نتائج مطابقة" : "لا يوجد حسابات بعد"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((account) => {
            const statusInfo = STATUS_LABELS[account.status] || STATUS_LABELS.in_progress;
            return (
              <div
                key={account.id}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-neutral-100">{account.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.color}`}>
                    {statusInfo.emoji} {statusInfo.label}
                  </span>
                </div>
                {account.description && (
                  <p className="text-neutral-500 text-sm line-clamp-2">{account.description}</p>
                )}
                <p className="text-neutral-600 text-xs">
                  آخر تعديل: {new Date(account.updated_at).toLocaleDateString("ar-EG")}
                </p>
                <div className="flex gap-2 mt-auto pt-2">
                  <Link
                    to={`/dashboard/accounts/${account.id}`}
                    className="flex-1 text-center bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    فتح
                  </Link>
                  <button
                    onClick={() => setModalData(account)}
                    className="px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-2 rounded-xl text-xs transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeleteTarget(account)}
                    className="px-3 bg-red-950 hover:bg-red-900 text-red-300 py-2 rounded-xl text-xs transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalData && (
        <AccountModal
          initialData={modalData}
          onClose={() => setModalData(null)}
          onSaved={() => {
            setModalData(null);
            fetchAccounts();
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-sm text-center">
            <p className="text-neutral-100 font-medium mb-1">حذف "{deleteTarget.name}"؟</p>
            <p className="text-neutral-500 text-sm mb-5">هذا الإجراء لا يمكن التراجع عنه.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
