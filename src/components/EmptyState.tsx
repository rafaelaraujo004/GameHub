interface EmptyStateProps {
  hasSearch: boolean;
  onAddGame: () => void;
}

export function EmptyState({ hasSearch, onAddGame }: EmptyStateProps) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-5xl mb-4 opacity-30">🔍</div>
        <p className="text-gray-500 text-sm">Nenhum jogo encontrado para essa busca.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="text-7xl animate-pulse select-none">🎮</div>
      <div>
        <h3 className="text-xl font-bold text-white mb-1">Sua biblioteca está vazia</h3>
        <p className="text-gray-500 text-sm">Adicione seus jogos e acesse-os de qualquer lugar.</p>
      </div>
      <button
        onClick={onAddGame}
        className="mt-2 bg-[#00ff88] text-black px-6 py-3 rounded-xl font-bold
          hover:bg-[#00e67a] active:scale-95 transition-all duration-150 shadow-lg
          shadow-[#00ff88]/20"
      >
        + Adicionar primeiro jogo
      </button>
    </div>
  );
}
