import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiUrl } from "../lib/api";
import ManualEraser from "./ManualEraser";

const API_URL = apiUrl("/api/remove-background");
const PREPARE_URL = apiUrl("/api/remove-background/prepare");
const TUNE_URL = apiUrl("/api/remove-background/tune");
const MAX_FILES = 100;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

const CATEGORY_LABELS = {
  characters: "Characters",
  outfits: "Outfits",
  xsuits: "X-Suits",
  weapons: "Weapons",
  vehicles: "Vehicles",
  backpacks: "Backpacks",
  helmets: "Helmets",
  frames: "Frames",
  achievements: "Achievements",
  emotes: "Emotes",
  planes: "Plane Skins",
  boats: "Boat Skins",
  other: "Other",
};

// حالات كل عنصر بالقائمة
const ITEM_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  DONE: "done",
  ERROR: "error",
  SAVING: "saving",
  SAVED: "saved",
  SAVE_ERROR: "save_error",
};

let idCounter = 0;
const nextId = () => `item_${Date.now()}_${idCounter++}`;

export default function BackgroundRemover() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("accountId");
  const category = searchParams.get("category") || "other";

  const [subscription, setSubscription] = useState(null); // {plan, used, limit, period_end}
  const [loadingSubscription, setLoadingSubscription] = useState(true);

  const refreshSubscription = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data, error } = await supabase.rpc("ensure_subscription", {
      p_user_id: userData.user.id,
    });
    if (error) {
      console.error("فشل جلب الاشتراك:", error);
      setLoadingSubscription(false);
      return;
    }
    if (data) {
      const limit = data.plan === "pro" ? 5 : 1;
      setSubscription({
        plan: data.plan,
        used: data.images_used_this_period,
        limit,
        period_end: data.period_end,
      });
    }
    setLoadingSubscription(false);
  }, []);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  const consumeCredit = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { allowed: false };
    const { data, error } = await supabase.rpc("consume_image_credit", {
      p_user_id: userData.user.id,
    });
    if (error) {
      console.error("فشل التحقق من الرصيد:", error);
      return { allowed: false };
    }
    setSubscription({
      plan: data.plan,
      used: data.used,
      limit: data.limit,
      period_end: data.period_end,
    });
    return data;
  };

  const [queue, setQueue] = useState([]); // { id, file, name, beforeUrl, afterUrl, afterBlob, status, error }
  const [editingItemId, setEditingItemId] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useCustomSettings, setUseCustomSettings] = useState(false);
  const [lowThresh, setLowThresh] = useState(0.28);
  const [highThresh, setHighThresh] = useState(0.6);
  const [paddingX, setPaddingX] = useState(0.4);
  const [paddingY, setPaddingY] = useState(0.15);
  const [useBlackBgRefine, setUseBlackBgRefine] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      // تنظيف الـ Object URLs عند مغادرة الصفحة
      queue.forEach((item) => {
        if (item.beforeUrl) URL.revokeObjectURL(item.beforeUrl);
        if (item.afterUrl) URL.revokeObjectURL(item.afterUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []);
      const validFiles = files.filter((f) => ALLOWED_TYPES.includes(f.type));
      const rejectedCount = files.length - validFiles.length;

      setQueue((prev) => {
        const remainingSlots = MAX_FILES - prev.length;
        const toAdd = validFiles.slice(0, Math.max(0, remainingSlots));
        const newItems = toAdd.map((file) => ({
          id: nextId(),
          file,
          name: file.name,
          beforeUrl: URL.createObjectURL(file),
          afterUrl: null,
          afterBlob: null,
          status: ITEM_STATUS.PENDING,
          error: "",
        }));
        return [...prev, ...newItems];
      });

      if (rejectedCount > 0) {
        alert(`${rejectedCount} ملف تم تجاهله (صيغة غير مدعومة). المسموح: PNG, JPG, WEBP.`);
      }
    },
    []
  );

  const onInputChange = (e) => {
    addFiles(e.target.files);
    e.target.value = ""; // يسمح برفع نفس الملف مرة ثانية لو احتاج
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);

  const removeItem = (id) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.beforeUrl) URL.revokeObjectURL(item.beforeUrl);
      if (item?.afterUrl) URL.revokeObjectURL(item.afterUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearCompleted = () => {
    setQueue((prev) => prev.filter((i) => i.status !== ITEM_STATUS.DONE && i.status !== ITEM_STATUS.SAVED));
  };

  const updateItem = (id, patch) => {
    setQueue((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const saveToAccount = async (item) => {
    if (!accountId || !item.afterBlob) return;
    updateItem(item.id, { status: ITEM_STATUS.SAVING });
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("الرجاء تسجيل الدخول أولاً.");
      const userId = userData.user.id;

      const baseName = item.name.replace(/\.[^/.]+$/, "") || "image";
      const uniqueName = `${Date.now()}_${baseName}.png`;
      const storagePath = `users/${userId}/accounts/${accountId}/${category}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from("user-files")
        .upload(storagePath, item.afterBlob, { contentType: "image/png" });
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

      updateItem(item.id, { status: ITEM_STATUS.SAVED });
    } catch (err) {
      updateItem(item.id, { status: ITEM_STATUS.SAVE_ERROR, error: err.message });
    }
  };

  const tuneItem = async (item) => {
    updateItem(item.id, { status: ITEM_STATUS.PROCESSING, error: "" });
    try {
      const formData = new FormData();
      formData.append("session_id", item.sessionId);
      formData.append("low_thresh", lowThresh);
      formData.append("high_thresh", highThresh);
      formData.append("capture_padding_x", paddingX);
      formData.append("capture_padding_y", paddingY);

      const res = await fetch(TUNE_URL, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `فشل الطلب (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const afterUrl = URL.createObjectURL(blob);
      updateItem(item.id, { status: ITEM_STATUS.DONE, afterUrl, afterBlob: blob });

      if (accountId) {
        await saveToAccount({ ...item, afterBlob: blob });
      }
    } catch (err) {
      updateItem(item.id, { status: ITEM_STATUS.ERROR, error: err.message || "فشل التعديل." });
    }
  };

  const processItem = async (item) => {
    // نتحقق من الرصيد بس أول مرة نعالج فيها هالصورة (مو عند كل تعديل
    // بالإعدادات المتقدمة اللي تستخدم /tune على نفس الصورة أصلاً)
    const isFirstProcessing = !item.sessionId && item.status !== ITEM_STATUS.DONE;
    if (isFirstProcessing) {
      const credit = await consumeCredit();
      if (!credit.allowed) {
        updateItem(item.id, {
          status: ITEM_STATUS.ERROR,
          error: `وصلت للحد الأقصى لخطتك (${credit.limit} صورة/شهر).`,
        });
        navigate("/dashboard/upgrade");
        return;
      }
    }

    // بوضع الإعدادات المخصصة: نحضّر الجلسة مرة وحدة (ثقيلة)، وبعدها كل
    // تعديل بالشرائط يستخدم /tune فقط (سريعة، بدون إعادة تشغيل النماذج).
    if (useCustomSettings) {
      if (item.sessionId) {
        await tuneItem(item);
        return;
      }
      updateItem(item.id, { status: ITEM_STATUS.PROCESSING, error: "" });
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        const res = await fetch(PREPARE_URL, { method: "POST", body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `فشل التحضير (HTTP ${res.status})`);
        }
        const { session_id } = await res.json();
        updateItem(item.id, { sessionId: session_id });
        await tuneItem({ ...item, sessionId: session_id });
      } catch (err) {
        updateItem(item.id, { status: ITEM_STATUS.ERROR, error: err.message || "فشل التحضير." });
      }
      return;
    }

    // الوضع الافتراضي (بدون إعدادات مخصصة): معالجة عادية بضغطة واحدة
    updateItem(item.id, { status: ITEM_STATUS.PROCESSING, error: "" });
    try {
      const formData = new FormData();
      formData.append("file", item.file);
      if (useBlackBgRefine) {
        formData.append("use_black_bg_refine", "true");
      }
      const res = await fetch(API_URL, { method: "POST", body: formData });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `فشل الطلب (HTTP ${res.status})`);
      }

      const blob = await res.blob();
      const afterUrl = URL.createObjectURL(blob);
      updateItem(item.id, { status: ITEM_STATUS.DONE, afterUrl, afterBlob: blob });

      if (accountId) {
        await saveToAccount({ ...item, afterBlob: blob });
      }
    } catch (err) {
      updateItem(item.id, { status: ITEM_STATUS.ERROR, error: err.message || "فشلت المعالجة." });
    }
  };

  const startProcessing = async () => {
    cancelledRef.current = false;
    setIsRunning(true);

    // نعالج بالتتابع (مو متوازي) لأن السيرفر يعمل على CPU بدون GPU
    // ومعالجة متوازية لن تكون أسرع، بل قد تبطئ أو تفشل الطلبات.
    const pendingIds = queue.filter((i) => i.status === ITEM_STATUS.PENDING).map((i) => i.id);
    for (const id of pendingIds) {
      if (cancelledRef.current) break;
      const currentItem = queue.find((i) => i.id === id);
      // نجيب أحدث نسخة من الـ state وقت المعالجة الفعلية
      // eslint-disable-next-line no-await-in-loop
      await processItem(currentItem);
    }

    setIsRunning(false);
  };

  const stopProcessing = () => {
    cancelledRef.current = true;
    setIsRunning(false);
  };

  const retryItem = (id) => {
    const item = queue.find((i) => i.id === id);
    if (item) processItem(item);
  };

  const handleManualSave = async (newBlob) => {
    const item = queue.find((i) => i.id === editingItemId);
    if (!item) return;

    const newUrl = URL.createObjectURL(newBlob);
    if (item.afterUrl) URL.revokeObjectURL(item.afterUrl);

    updateItem(item.id, { afterUrl: newUrl, afterBlob: newBlob });
    setEditingItemId(null);

    if (accountId) {
      await saveToAccount({ ...item, afterBlob: newBlob });
    }
  };

  const downloadItem = (item) => {
    if (!item.afterUrl) return;
    const a = document.createElement("a");
    a.href = item.afterUrl;
    const base = item.name.replace(/\.[^/.]+$/, "") || "character";
    a.download = `${base}_no_bg.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAll = () => {
    queue.filter((i) => i.status === ITEM_STATUS.DONE || i.status === ITEM_STATUS.SAVED).forEach(downloadItem);
  };

  const pendingCount = queue.filter((i) => i.status === ITEM_STATUS.PENDING).length;
  const doneCount = queue.filter(
    (i) => i.status === ITEM_STATUS.DONE || i.status === ITEM_STATUS.SAVED
  ).length;
  const errorCount = queue.filter((i) => i.status === ITEM_STATUS.ERROR).length;
  const totalCount = queue.length;

  const STATUS_BADGE = {
    [ITEM_STATUS.PENDING]: { text: "بالانتظار", color: "bg-neutral-800 text-neutral-400" },
    [ITEM_STATUS.PROCESSING]: { text: "جارِ المعالجة...", color: "bg-amber-500/15 text-amber-400" },
    [ITEM_STATUS.DONE]: { text: "تم", color: "bg-emerald-500/15 text-emerald-400" },
    [ITEM_STATUS.ERROR]: { text: "فشل", color: "bg-red-950 text-red-300" },
    [ITEM_STATUS.SAVING]: { text: "جارِ الحفظ...", color: "bg-blue-500/15 text-blue-400" },
    [ITEM_STATUS.SAVED]: { text: "✅ محفوظ بالحساب", color: "bg-emerald-500/15 text-emerald-400" },
    [ITEM_STATUS.SAVE_ERROR]: { text: "فشل الحفظ", color: "bg-red-950 text-red-300" },
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl">
        <header className="mb-8 text-center">
          {accountId && (
            <Link
              to={`/dashboard/accounts/${accountId}`}
              className="text-neutral-500 text-sm hover:text-neutral-300 block mb-3"
            >
              ← العودة للحساب
            </Link>
          )}
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Background Remover</h1>
          <p className="text-neutral-400 mt-2 text-sm">
            {accountId
              ? `الصور ستُحفظ تلقائياً بقسم ${CATEGORY_LABELS[category] || category}`
              : "ارفع صورة واحدة أو حتى 100 صورة دفعة واحدة"}
          </p>

          {!loadingSubscription && subscription && (
            <div
              className={`inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-xl text-xs font-medium ${
                subscription.used >= subscription.limit
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-neutral-800 text-neutral-300 border border-neutral-700"
              }`}
            >
              <span>
                {subscription.plan === "pro" ? "⭐ خطة Pro" : "🆓 خطة Free"} — {subscription.used}/
                {subscription.limit} صورة هذا الشهر
              </span>
              {subscription.plan === "free" && (
                <span className="text-amber-400 underline underline-offset-2 cursor-pointer">
                  رقّي لـ Pro
                </span>
              )}
            </div>
          )}
        </header>

        <div className="mb-6">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-neutral-500 hover:text-neutral-300 text-xs underline underline-offset-2 mb-2"
          >
            {showAdvanced ? "▲ إخفاء" : "▼ إظهار"} الإعدادات المتقدمة (للحالات الصعبة)
          </button>

          <label className="flex items-center gap-2 text-xs text-neutral-400 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useBlackBgRefine}
              onChange={(e) => setUseBlackBgRefine(e.target.checked)}
              className="accent-amber-500"
            />
            🖤 تجربة: تسويد الخلفية التقريبية قبل التحليل (للعناصر اللامعة/الشفافة)
          </label>

          {showAdvanced && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <label className="flex items-center gap-2 text-sm text-neutral-300 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomSettings}
                  onChange={(e) => setUseCustomSettings(e.target.checked)}
                  className="accent-amber-500"
                />
                استخدام إعدادات مخصصة (بدل الافتراضية المضبوطة)
              </label>

              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${!useCustomSettings ? "opacity-40 pointer-events-none" : ""}`}>
                <div>
                  <label className="text-neutral-400 text-xs block mb-1">
                    العتبة السفلية (low_thresh): {lowThresh.toFixed(2)}
                    <span className="text-neutral-600"> — أقل = يحافظ على أجزاء شفافة أكثر، لكن قد ترجع ضبابية بالخلفية</span>
                  </label>
                  <input
                    type="range"
                    min={0.02}
                    max={0.5}
                    step={0.01}
                    value={lowThresh}
                    onChange={(e) => setLowThresh(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 text-xs block mb-1">
                    العتبة العليا (high_thresh): {highThresh.toFixed(2)}
                    <span className="text-neutral-600"> — أقل = يحوّل الأجزاء نصف الشفافة لمعتمة أسرع</span>
                  </label>
                  <input
                    type="range"
                    min={0.3}
                    max={0.9}
                    step={0.01}
                    value={highThresh}
                    onChange={(e) => setHighThresh(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 text-xs block mb-1">
                    هامش الالتقاط الأفقي: {(paddingX * 100).toFixed(0)}%
                    <span className="text-neutral-600"> — أكبر = يمسك سلاح ممتد أكثر، لكن قد يمسك عناصر جانبية</span>
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.02}
                    value={paddingX}
                    onChange={(e) => setPaddingX(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 text-xs block mb-1">
                    هامش الالتقاط العمودي: {(paddingY * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min={0.02}
                    max={0.5}
                    step={0.02}
                    value={paddingY}
                    onChange={(e) => setPaddingY(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              <p className="text-neutral-600 text-[11px] mt-3">
                💡 أول مرة تعالج فيها صورة بالإعدادات المخصصة تاخذ وقتها المعتاد
                (كشف + تحليل). بعدها، أي تعديل بالشرائط يطبَّق بضغطة "🎚 تطبيق
                الإعدادات الحالية" بثوانٍ بس (بدون إعادة الكشف من الصفر).
              </p>
            </div>
          )}
        </div>

        {/* منطقة الرفع */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer
            ${isDragging ? "border-amber-400 bg-amber-400/5" : "border-neutral-700 bg-neutral-900"}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={onInputChange}
          />
          <p className="text-neutral-300 font-medium">اسحب وأفلت الصور هنا (حتى {MAX_FILES} صورة)، أو</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="mt-3 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-5 py-2 rounded-xl transition-colors"
          >
            Upload
          </button>
          <p className="text-neutral-500 text-xs mt-3">PNG / JPG / WEBP لكل صورة — حتى 15MB للصورة الواحدة</p>
        </div>

        {/* شريط تحكم القائمة */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
            <div className="text-sm text-neutral-400">
              {totalCount} صورة — {doneCount} تمت، {pendingCount} بالانتظار
              {errorCount > 0 && <span className="text-red-400">، {errorCount} فشلت</span>}
            </div>
            <div className="flex gap-2">
              {!isRunning ? (
                <button
                  onClick={startProcessing}
                  disabled={pendingCount === 0}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 disabled:cursor-not-allowed text-neutral-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  بدء المعالجة ({pendingCount})
                </button>
              ) : (
                <button
                  onClick={stopProcessing}
                  className="bg-red-600 hover:bg-red-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  إيقاف
                </button>
              )}
              {doneCount > 0 && !accountId && (
                <button
                  onClick={downloadAll}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  تحميل الكل
                </button>
              )}
              {doneCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  مسح المكتمل
                </button>
              )}
            </div>
          </div>
        )}

        {/* شبكة الصور بالقائمة */}
        {totalCount > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
            {queue.map((item) => {
              const badge = STATUS_BADGE[item.status];
              return (
                <div
                  key={item.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col"
                >
                  <div className="aspect-square transparency-grid flex items-center justify-center relative">
                    <img
                      src={item.afterUrl || item.beforeUrl}
                      alt={item.name}
                      className="max-h-full max-w-full object-contain"
                    />
                    {item.status === ITEM_STATUS.PENDING && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="absolute top-2 left-2 bg-neutral-950/80 text-neutral-300 text-xs w-6 h-6 rounded-full flex items-center justify-center"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <p className="text-neutral-400 text-xs truncate">{item.name}</p>
                    <span className={`text-[10px] px-2 py-1 rounded-full self-start ${badge.color}`}>
                      {badge.text}
                    </span>
                    {(item.status === ITEM_STATUS.ERROR || item.status === ITEM_STATUS.SAVE_ERROR) && (
                      <button
                        onClick={() => retryItem(item.id)}
                        className="text-amber-400 text-xs underline underline-offset-2 text-start"
                      >
                        إعادة المحاولة
                      </button>
                    )}
                    {useCustomSettings &&
                      item.sessionId &&
                      (item.status === ITEM_STATUS.DONE ||
                        item.status === ITEM_STATUS.SAVED ||
                        item.status === ITEM_STATUS.SAVE_ERROR) && (
                        <button
                          onClick={() => tuneItem(item)}
                          className="text-emerald-400 text-xs underline underline-offset-2 text-start"
                        >
                          🎚 تطبيق الإعدادات الحالية (سريع)
                        </button>
                      )}
                    {(item.status === ITEM_STATUS.DONE ||
                      item.status === ITEM_STATUS.SAVED ||
                      item.status === ITEM_STATUS.SAVE_ERROR) &&
                      item.afterBlob && (
                        <button
                          onClick={() => setEditingItemId(item.id)}
                          className="text-blue-400 text-xs underline underline-offset-2 text-start"
                        >
                          ✏️ تعديل يدوي
                        </button>
                      )}
                    {item.status === ITEM_STATUS.DONE && !accountId && (
                      <button
                        onClick={() => downloadItem(item)}
                        className="text-neutral-300 text-xs underline underline-offset-2 text-start"
                      >
                        تحميل PNG
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingItemId &&
        (() => {
          const item = queue.find((i) => i.id === editingItemId);
          if (!item) return null;
          return (
            <ManualEraser
              beforeUrl={item.beforeUrl}
              resultBlob={item.afterBlob}
              onSave={handleManualSave}
              onClose={() => setEditingItemId(null)}
            />
          );
        })()}
    </div>
  );
}
