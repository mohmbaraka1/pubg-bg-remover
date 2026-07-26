import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: "🪄",
    title: "إزالة خلفية بالذكاء الاصطناعي",
    desc: "ارفع سكرين شوت من اللعبة، والنظام يفصل شخصيتك عن الخلفية تلقائياً بدقة عالية — حتى مع الأسلحة والملابس الشفافة.",
  },
  {
    icon: "🧩",
    title: "قوالب جاهزة تبدّل عناصرها",
    desc: "اختر من عشرات التصاميم الاحترافية الجاهزة، واستبدل الشخصيات والأسلحة بعناصرك الخاصة بضغطة زر — بدون أي خبرة تصميم.",
  },
  {
    icon: "🤖",
    title: "توليد تلقائي بضغطة وحدة",
    desc: "اختر عدد الشخصيات والأسلحة، والنظام يرتّبهم لك تلقائياً بتنسيق احترافي جاهز للتصدير.",
  },
  {
    icon: "📚",
    title: "مكتبة عناصر منظّمة",
    desc: "أسلحة، مركبات، إكسسوارات — كل شي مصنّف ومقسّم (هجومية، قنص، رشاشات...) عشان تلقى اللي تدور عليه بثواني.",
  },
];

const STEPS = [
  { n: "١", title: "ارفع صورة حسابك", desc: "سكرين شوت عادي من داخل اللعبة، بأي جودة." },
  { n: "٢", title: "اختر قالب أو صمم", desc: "قالب جاهز تعدّل عليه، أو تصميم حر من الصفر." },
  { n: "٣", title: "صدّر وبيع", desc: "صورة احترافية جاهزة للنشر خلال دقائق، مو ساعات." },
];

export default function Welcome() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#0d0f17] text-[#f2f0ea] overflow-x-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black tracking-tight">
            <span className="text-[#f0b429]">GS</span> Studio
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-neutral-300 hover:text-white transition-colors px-3 py-2"
          >
            تسجيل الدخول
          </Link>
          <Link
            to="/register"
            className="text-sm font-semibold bg-[#f0b429] hover:bg-[#e0a520] text-[#0d0f17] px-4 py-2 rounded-xl transition-colors"
          >
            ابدأ مجاناً
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 md:px-12 pt-16 pb-24 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block text-xs font-semibold text-[#f0b429] bg-[#f0b429]/10 border border-[#f0b429]/20 px-3 py-1.5 rounded-full mb-5">
              مصمّم خصيصاً لتجار حسابات PUBG Mobile
            </span>
            <h1 className="text-4xl md:text-6xl font-black leading-[1.1] mb-6">
              من سكرين شوت عادي،
              <br />
              <span className="text-[#f0b429]">لتصميم يبيع.</span>
            </h1>
            <p className="text-neutral-400 text-lg leading-relaxed mb-8 max-w-md">
              إزالة خلفية بالذكاء الاصطناعي + قوالب جاهزة تبدّل عناصرها. تصميم احترافي لحسابك خلال دقائق، بدون ما تفتح فوتوشوب.
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/register"
                className="bg-[#f0b429] hover:bg-[#e0a520] text-[#0d0f17] font-bold px-6 py-3.5 rounded-xl transition-colors"
              >
                جرّب مجاناً الآن
              </Link>
              <span className="text-neutral-500 text-sm">صورة مجانية شهرياً، بدون بطاقة ائتمان</span>
            </div>
          </div>

          {/* Before/After visual */}
          <div className="relative">
            <div className="grid grid-cols-2 gap-3 rounded-3xl overflow-hidden border border-white/10">
              <div className="bg-[#171a26] p-4 flex flex-col gap-2">
                <span className="text-[10px] text-neutral-500 font-medium mb-1">قبل</span>
                <div className="aspect-[3/4] rounded-xl bg-gradient-to-b from-[#2a2d3a] to-[#1a1c26] flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-40" style={{
                    backgroundImage: "repeating-linear-gradient(45deg, #3a3d4a 0, #3a3d4a 1px, transparent 1px, transparent 12px)"
                  }} />
                  <span className="text-4xl relative">📱</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-[#f0b429]/20 to-[#8b5cf6]/20 p-4 flex flex-col gap-2 relative">
                <span className="text-[10px] text-[#f0b429] font-medium mb-1">بعد</span>
                <div className="aspect-[3/4] rounded-xl bg-gradient-to-br from-[#8b5cf6]/30 via-[#f0b429]/20 to-transparent flex items-center justify-center relative overflow-hidden border border-[#f0b429]/30">
                  <span className="text-4xl">✨</span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-4 bg-[#f0b429] text-[#0d0f17] text-xs font-bold px-4 py-2 rounded-full shadow-lg">
              أقل من 5 دقايق ⚡
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-12 py-20 bg-[#10121c] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-black mb-2">كل شي تحتاجه بمكان وحد</h2>
          <p className="text-neutral-500 mb-12">من إزالة الخلفية للتصميم النهائي، بدون ما تخرج من الموقع</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-[#171a26] border border-white/5 rounded-2xl p-6 hover:border-[#f0b429]/30 transition-colors"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold mb-2">{f.title}</h3>
                <p className="text-neutral-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 py-20 max-w-6xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-black mb-12 text-center">3 خطوات، وخلصت</h2>
        <div className="grid md:grid-cols-3 gap-8 relative">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center relative">
              <div className="w-16 h-16 rounded-2xl bg-[#f0b429]/10 border border-[#f0b429]/30 text-[#f0b429] text-2xl font-black flex items-center justify-center mx-auto mb-4">
                {s.n}
              </div>
              <h3 className="font-bold mb-2">{s.title}</h3>
              <p className="text-neutral-500 text-sm">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 md:px-12 py-20 bg-[#10121c] border-y border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-black mb-2 text-center">خطة تناسبك</h2>
          <p className="text-neutral-500 mb-12 text-center">ابدأ مجاناً، ورقّي وقت ما تحتاج</p>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-[#171a26] border border-white/10 rounded-2xl p-7">
              <h3 className="text-lg font-bold mb-1">Free</h3>
              <p className="text-3xl font-black mb-5">
                0$<span className="text-sm text-neutral-500 font-normal"> / شهرياً</span>
              </p>
              <ul className="text-neutral-400 text-sm space-y-2.5 mb-7">
                <li>✓ صورة واحدة شهرياً</li>
                <li>✓ كل أدوات التصميم</li>
                <li>✓ مكتبة العناصر الجاهزة</li>
              </ul>
              <Link
                to="/register"
                className="block text-center bg-white/5 hover:bg-white/10 border border-white/10 font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                ابدأ الآن
              </Link>
            </div>
            <div className="bg-gradient-to-br from-[#f0b429]/10 to-transparent border-2 border-[#f0b429] rounded-2xl p-7 relative">
              <span className="absolute -top-3 right-6 bg-[#f0b429] text-[#0d0f17] text-xs font-bold px-3 py-1 rounded-full">
                الأفضل قيمة
              </span>
              <h3 className="text-lg font-bold mb-1">Pro</h3>
              <p className="text-3xl font-black mb-5">
                20$<span className="text-sm text-neutral-500 font-normal"> / شهرياً</span>
              </p>
              <ul className="text-neutral-400 text-sm space-y-2.5 mb-7">
                <li>✓ 5 صور شهرياً</li>
                <li>✓ كل أدوات التصميم</li>
                <li>✓ مكتبة العناصر الجاهزة</li>
                <li>✓ أولوية بالدعم الفني</li>
              </ul>
              <Link
                to="/register"
                className="block text-center bg-[#f0b429] hover:bg-[#e0a520] text-[#0d0f17] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                ابدأ مع Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-12 py-10 text-center">
        <p className="text-neutral-600 text-sm">© 2026 GS Studio — صُنع لتجار حسابات PUBG Mobile</p>
      </footer>
    </div>
  );
}
