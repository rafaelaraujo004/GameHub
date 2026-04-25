export function GameCardSkeleton() {
  return (
    <div className="game-case">
      <div className="game-case-cover aspect-[10/14] animate-shimmer" />
      <div className="p-4 space-y-2">
        <div className="h-4 rounded-lg animate-shimmer w-3/4" />
        <div className="h-3 rounded-lg animate-shimmer w-1/2" />
        <div className="h-9 rounded-xl animate-shimmer mt-3" />
      </div>
    </div>
  );
}

export function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <GameCardSkeleton key={i} />
      ))}
    </div>
  );
}
