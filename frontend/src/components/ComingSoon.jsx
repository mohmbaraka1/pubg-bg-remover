export default function ComingSoon({ title, description, icon = "✨" }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-3xl mb-4">
        {icon}
      </div>
      <h2 className="text-xl font-bold text-neutral-100 mb-2">{title}</h2>
      <p className="text-neutral-500 text-sm max-w-sm">{description}</p>
      <span className="mt-4 text-xs bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full">
        Coming Soon
      </span>
    </div>
  );
}
