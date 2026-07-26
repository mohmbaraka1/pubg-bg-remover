import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Upgrade() {
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: userData }) => {
      if (!userData.user) return;
      const { data } = await supabase.rpc("ensure_subscription", { p_user_id: userData.user.id });
      if (data) {
        setSubscription({
          plan: data.plan,
          used: data.images_used_this_period,
          limit: data.plan === "pro" ? 5 : 1,
        });
      }
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">الخطط والأسعار</h1>
      <p className="text-neutral-500 text-sm mb-8">
        وصلت للحد الأقصى من صورك المجانية هذا الشهر — رقّي لخطة Pro لمزيد من الصور
      </p>

      {subscription && (
        <div className="bg-neutral-900 border border-amber-500/30 rounded-xl p-4 mb-8 inline-block">
          <p className="text-neutral-300 text-sm">
            وضعك الحالي: <strong>{subscription.plan === "pro" ? "Pro" : "Free"}</strong> —{" "}
            {subscription.used}/{subscription.limit} صورة مستخدمة هذا الشهر
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-1">Free</h2>
          <p className="text-3xl font-bold mb-4">
            0$<span className="text-sm text-neutral-500 font-normal"> / شهرياً</span>
          </p>
          <ul className="text-neutral-400 text-sm space-y-2 mb-6">
            <li>✓ صورة واحدة شهرياً</li>
            <li>✓ كل أدوات التصميم</li>
            <li>✓ مكتبة العناصر الجاهزة</li>
          </ul>
          <div className="text-center text-neutral-600 text-xs py-2">خطتك الحالية</div>
        </div>

        <div className="bg-neutral-900 border-2 border-amber-500 rounded-2xl p-6 relative">
          <span className="absolute -top-3 right-4 bg-amber-500 text-neutral-950 text-xs font-bold px-3 py-1 rounded-full">
            الأفضل قيمة
          </span>
          <h2 className="text-lg font-bold mb-1">Pro</h2>
          <p className="text-3xl font-bold mb-4">
            20$<span className="text-sm text-neutral-500 font-normal"> / شهرياً</span>
          </p>
          <ul className="text-neutral-400 text-sm space-y-2 mb-6">
            <li>✓ 5 صور شهرياً</li>
            <li>✓ كل أدوات التصميم</li>
            <li>✓ مكتبة العناصر الجاهزة</li>
            <li>✓ أولوية بالدعم الفني</li>
          </ul>
          <a
            href="https://wa.me/0567483013"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            💬 تواصل للترقية
          </a>
        </div>
      </div>

      <p className="text-neutral-600 text-xs mt-8">
        💡 الدفع الإلكتروني المباشر لسه ما فعّلناه — حالياً الترقية تصير يدوياً عبر التواصل المباشر.
      </p>
    </div>
  );
}
