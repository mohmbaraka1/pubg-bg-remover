import { useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const API_URL = "/api/remove-background-multi";

export default function MultiCharacterExtractor() {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("accountId");
  const category = searchParams.get("category") || "characters";

  const [beforeUrl, setBeforeUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | processing | done | error
  const [error, setError] = useState("");
  const [results, setResults] = useState([]); // [{id, dataUrl, saveStatus}]
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef();

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    setBeforeUrl(URL.createObjectURL(file));
    setResults([]);
    setStatus("idle");
    fileInputRef.current._selectedFile = file;
  };

  const onInputChange = (e) => handleFile(e.target.files?.[0]);
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);

  const handleExtractAll = async () => {
    const file = fileInputRef.current?._selectedFile;
    if (!file) return;

    setStatus("processing");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(API_URL, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `فشل الطلب (HTTP ${res.status})`);
      }
      const data = await res.json();
      const items = data.images.map((b64, i) => ({
        id: `char_${i}_${Date.now()}`,
        dataUrl: `data:image/png;base64,${b64}`,
        saveStatus: "idle",
      }));
      setResults(items);
      setStatus("done");

      if (accountId) {
        for (const item of items) {
          // eslint-disable-next-line no-await-in-loop
          await saveToAccount(item);
        }
      }
    } catch (err) {
      setError(err.message || "فشل استخراج الشخصيات.");
      setStatus("error");
    }
  };

  const saveToAccount = async (item) => {
    setResults((prev) => prev.map((r) => (r.id === item.id ? { ...r, saveStatus: "saving" } : r)));
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("الرجاء تسجيل الدخول.");
      const userId = userData.user.id;

      const blob = await (await fetch(item.dataUrl)).blob();
      const uniqueName = `${Date.now()}_${item.id}.png`;
      const storagePath = `users/${userId}/accounts/${accountId}/${category}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from("user-files")
        .upload(storagePath, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);
      const { error: insertError } = await supabase.from("assets").insert({
        account_id: accountId,
        user_id: userId,
        category,
        file_url: publicUrlData.publicUrl,
        file_name: uniqueName,
      });
      if (insertError) throw insertError;

      setResults((prev) => prev.map((r) => (r.id === item.id ? { ...r, saveStatus: "saved" } : r)));
    } catch (err) {
      setResults((prev) => prev.map((r) => (r.id === item.id ? { ...r, saveStatus: "error" } : r)));
    }
  };

  const downloadItem = (item, index) => {
    const a = document.createElement("a");
    a.href = item.dataUrl;
    a.download = `character_${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          {accountId && (
            <Link
              to={`/dashboard/accounts/${accountId}`}
              className="text-neutral-500 text-sm hover:text-neutral-300 block mb-3"
            >
              ← العودة للحساب
            </Link>
          )}
          <h1 className="text-2xl md:text-3xl font-bold">استخراج كل الشخصيات من صورة واحدة</h1>
          <p className="text-neutral-400 mt-2 text-sm">
            ارفع صورة فيها عدة شخصيات (اصطفاف) وراح تطلعلك كل وحدة منهم منفصلة بخلفية شفافة
          </p>
        </header>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragging ? "border-amber-400 bg-amber-400/5" : "border-neutral-700 bg-neutral-900"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onInputChange}
          />
          <p className="text-neutral-300 font-medium">اسحب وأفلت الصورة هنا، أو اضغط للرفع</p>
        </div>

        {fileName && <p className="text-neutral-500 text-sm mt-3 text-center">{fileName}</p>}

        {beforeUrl && (
          <div className="flex justify-center mt-6">
            <button
              onClick={handleExtractAll}
              disabled={status === "processing"}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-6 py-2.5 rounded-xl transition-colors"
            >
              {status === "processing" ? "جارِ الاستخراج (قد يأخذ دقيقة أو أكثر)..." : "استخراج كل الشخصيات"}
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3 text-center">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-8">
            <p className="text-neutral-400 text-sm mb-4 text-center">
              تم استخراج {results.length} شخصية
              {accountId ? " — تُحفظ تلقائياً بمكتبة الحساب" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {results.map((item, index) => (
                <div
                  key={item.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden"
                >
                  <div className="aspect-square transparency-grid flex items-center justify-center">
                    <img src={item.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="p-2 flex flex-col gap-1 items-center">
                    {accountId ? (
                      <span className="text-[10px] text-neutral-500">
                        {item.saveStatus === "saving" && "جارِ الحفظ..."}
                        {item.saveStatus === "saved" && "✅ محفوظ"}
                        {item.saveStatus === "error" && "❌ فشل الحفظ"}
                      </span>
                    ) : (
                      <button
                        onClick={() => downloadItem(item, index)}
                        className="text-neutral-300 text-xs underline underline-offset-2"
                      >
                        تحميل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
