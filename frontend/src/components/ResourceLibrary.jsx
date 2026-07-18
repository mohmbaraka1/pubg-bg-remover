import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ResourceLibrary({ tableName, label, accept, emoji }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);
  const fileInputRef = useRef();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from(tableName)
      .select("*")
      .order("created_at", { ascending: false });
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName]);

  const handleUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      alert("الرجاء تسجيل الدخول أولاً.");
      setUploading(false);
      return;
    }
    const userId = userData.user.id;

    for (const file of files) {
      const uniqueName = `${Date.now()}_${file.name}`;
      const storagePath = `users/${userId}/resources/${tableName}/${uniqueName}`;

      // eslint-disable-next-line no-await-in-loop
      const { error: uploadError } = await supabase.storage
        .from("user-files")
        .upload(storagePath, file);

      if (uploadError) {
        alert(`فشل رفع ${file.name}: ${uploadError.message}`);
        continue;
      }

      const { data: publicUrlData } = supabase.storage.from("user-files").getPublicUrl(storagePath);

      // eslint-disable-next-line no-await-in-loop
      await supabase.from(tableName).insert({
        user_id: userId,
        name: file.name.replace(/\.[^/.]+$/, ""),
        file_url: publicUrlData.publicUrl,
        tags: [],
      });
    }

    setUploading(false);
    fetchItems();
  };

  const handleDelete = async (item) => {
    const path = item.file_url.split("/user-files/")[1];
    if (path) await supabase.storage.from("user-files").remove([path]);
    await supabase.from(tableName).delete().eq("id", item.id);
    fetchItems();
  };

  const startRename = (item) => {
    setRenamingId(item.id);
    setRenameValue(item.name || "");
  };

  const saveRename = async (item) => {
    await supabase.from(tableName).update({ name: renameValue }).eq("id", item.id);
    setRenamingId(null);
    fetchItems();
  };

  const filtered = items.filter((i) =>
    (i.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const isImage = accept.includes("image");

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <input
          type="text"
          placeholder={`ابحث بـ ${label}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 text-neutral-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {uploading ? "جارِ الرفع..." : `+ رفع ${label}`}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => {
            handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {loading ? (
        <p className="text-neutral-500 text-sm">جارِ التحميل...</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[45vh] text-center border border-dashed border-neutral-800 rounded-2xl">
          <div className="text-3xl mb-3">{emoji}</div>
          <p className="text-neutral-400 font-medium">
            {search ? "لا توجد نتائج مطابقة" : `لا يوجد ${label} بعد`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {filtered.map((item) => {
            const isOwner = item.user_id === currentUserId;
            const isGlobal = Boolean(item.is_global);
            const canManage = isOwner && !isGlobal;

            return (
              <div
                key={item.id}
                className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col group"
              >
                <div className="aspect-square bg-neutral-950 flex items-center justify-center relative">
                  {isImage ? (
                    <img
                      src={item.file_url}
                      alt={item.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-3xl">{emoji}</span>
                  )}
                  {isGlobal && (
                    <span className="absolute top-2 right-2 text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                      🔒 رسمي
                    </span>
                  )}
                  {canManage && (
                    <button
                      onClick={() => handleDelete(item)}
                      className="absolute top-2 left-2 bg-red-950/80 text-red-300 text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      🗑️
                    </button>
                  )}
                </div>
                <div className="p-2">
                  {renamingId === item.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => saveRename(item)}
                      onKeyDown={(e) => e.key === "Enter" && saveRename(item)}
                      className="w-full bg-neutral-800 border border-amber-500 rounded-lg px-2 py-1 text-xs text-neutral-100 outline-none"
                    />
                  ) : (
                    <p
                      onClick={() => canManage && startRename(item)}
                      className={`text-neutral-300 text-xs truncate ${
                        canManage ? "cursor-pointer hover:text-amber-400" : ""
                      }`}
                      title={canManage ? "اضغط لإعادة التسمية" : item.name}
                    >
                      {item.name}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
