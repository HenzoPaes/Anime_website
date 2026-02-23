export default function SkeletonCard() {
  return (
    <div className="rounded-xl bg-dark-800 border border-white/5 overflow-hidden">
      <div className="aspect-[2/3] skeleton"/>
      <div className="p-3 space-y-2">
        <div className="h-4 skeleton rounded w-3/4"/>
        <div className="h-3 skeleton rounded w-1/2"/>
        <div className="flex gap-1 mt-1">
          <div className="h-4 skeleton rounded-full w-12"/>
          <div className="h-4 skeleton rounded-full w-16"/>
        </div>
      </div>
    </div>
  );
}
