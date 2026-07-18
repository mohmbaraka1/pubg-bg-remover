import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function DashboardHome() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, []);

  const cards = [
    { to: "/dashboard/accounts", icon: "📂", title: "My Accounts", desc: "أنشئ وأدر حسابات PUBG الخاصة بك" },
    { to: "/app", icon: "🖼", title: "Background Remover", desc: "استخرج شخصية من سكرين شوت الآن" },
    { to: "/dashboard/resources", icon: "🎨", title: "Design Resources", desc: "قوالب، خلفيات، تأثيرات، خطوط" },
    { to: "/dashboard/history", icon: "📜", title: "History", desc: "كل التصاميم اللي أنشأتها" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">أهلاً بك 👋</h1>
      <p className="text-neutral-500 text-sm mb-8">{email}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 hover:border-amber-500/40 transition-colors"
          >
            <div className="text-2xl mb-3">{card.icon}</div>
            <h3 className="font-semibold text-neutral-100 mb-1">{card.title}</h3>
            <p className="text-neutral-500 text-xs">{card.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
