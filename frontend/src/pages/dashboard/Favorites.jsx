export default function Favorites() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Favorites</h1>
      <p className="text-neutral-500 text-sm mb-6">العناصر التي وضعت عليها نجمة</p>

      <div className="flex flex-col items-center justify-center h-[55vh] text-center border border-dashed border-neutral-800 rounded-2xl">
        <div className="text-3xl mb-3">⭐</div>
        <p className="text-neutral-400 font-medium">لا يوجد عناصر مفضّلة بعد</p>
      </div>
    </div>
  );
}
