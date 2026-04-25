import { memo, useCallback, useMemo, useRef } from 'react';
import { useGamesStore } from '../store';
import { debounce } from '../utils';

interface SearchBarProps {
  onAddGame: () => void;
}

export const SearchBar = memo(function SearchBar({ onAddGame }: SearchBarProps) {
  // Selector atômico: só `setSearchQuery` (referência estável — nunca muda).
  // SearchBar NÃO subscreve `searchQuery`, eliminando re-renders a cada keystroke.
  const setSearchQuery = useGamesStore((s) => s.setSearchQuery);

  // Lê o valor inicial do store UMA vez (sem criar subscription)
  const initialQuery = useRef(useGamesStore.getState().searchQuery);

  const debouncedSet = useMemo(
    () => debounce((v: unknown) => setSearchQuery(v as string), 300),
    [setSearchQuery]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSet(e.target.value);
    },
    [debouncedSet]
  );

  return (
    <div className="flex gap-3 items-center">
      <div className="relative flex-1">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
          🔍
        </span>
        <input
          type="search"
          defaultValue={initialQuery.current}
          onChange={handleChange}
          placeholder="Buscar jogos..."
          className="w-full bg-[#111827] border border-white/10 rounded-xl pl-10 pr-4 py-2.5
            text-sm text-white placeholder:text-gray-600 outline-none
            focus:border-[#00ff88]/40 transition-colors"
        />
      </div>
      <button
        onClick={onAddGame}
        className="flex items-center gap-2 bg-[#00ff88] text-black px-5 py-2.5 rounded-xl
          font-bold text-sm hover:bg-[#00e67a] active:scale-95 transition-all duration-150
          whitespace-nowrap shadow-lg shadow-[#00ff88]/20"
      >
        <span className="text-base leading-none">+</span>
        <span className="hidden sm:inline">Adicionar Jogo</span>
      </button>
    </div>
  );
});
