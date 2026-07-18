import { useState } from "react";
import ResourceLibrary from "../../components/ResourceLibrary";

const TABS = [
  { key: "templates", label: "Templates", emoji: "🧩", accept: "image/png,image/jpeg,image/webp" },
  { key: "backgrounds", label: "Backgrounds", emoji: "🖼", accept: "image/png,image/jpeg,image/webp" },
  { key: "effects", label: "Effects", emoji: "✨", accept: "image/png,image/webp" },
  { key: "fonts", label: "Fonts", emoji: "🔤", accept: ".ttf,.otf,.woff,.woff2" },
];

export default function DesignResources() {
  const [activeTab, setActiveTab] = useState("templates");
  const activeConfig = TABS.find((t) => t.key === activeTab);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Design Resources</h1>
      <p className="text-neutral-500 text-sm mb-6">قوالب، خلفيات، تأثيرات، وخطوط جاهزة للاستخدام</p>

      <div className="flex gap-2 mb-6 border-b border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* key يجبر إعادة تحميل المكوّن عند تغيير التبويب لتفادي تداخل الحالة */}
      <ResourceLibrary
        key={activeConfig.key}
        tableName={activeConfig.key}
        label={activeConfig.label}
        accept={activeConfig.accept}
        emoji={activeConfig.emoji}
      />
    </div>
  );
}
