import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function BackgroundPickerModal({ onClose, onSelect }) {
  const [backgrounds, setBackgrounds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("backgrounds")
      .select("*")
      .order("is_global", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setBackgrounds(data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 sm:px-4">
      <div className="bg-neutral-900 border border-neutral-800 sm:rounded-2xl w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <h2 className="text-lg font-bold">اختر خلفية</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 text-xl">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-neutral-500 text-sm text-center py-10">جارِ التحميل...</p>
          ) : backgrounds.length === 0 ? (
            <p className="text-neutral-500 text-sm text-center py-10">
              لا يوجد خلفيات بعد. أضفها من Design Resources → Backgrounds.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {backgrounds.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => {
                    onSelect(bg.file_url);
                    onClose();
                  }}
                  className="aspect-video bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden hover:border-amber-500 transition-colors relative"
                >
                  <img
                    src={bg.file_url}
                    alt={bg.name || ""}
                    className="w-full h-full object-cover"
                  />
                  {bg.is_global && (
                    <span className="absolute top-1 right-1 text-[9px] bg-blue-500/30 text-blue-200 px-1.5 py-0.5 rounded-full">
                      🔒 رسمي
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
