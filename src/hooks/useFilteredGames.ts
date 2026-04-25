import { useMemo } from 'react';
import { useGamesStore } from '../store';
import type { Game } from '../types';
import { isPs2Platform } from '../utils';

/**
 * Retorna os jogos filtrados pela searchQuery atual do store.
 * Usa dois seletores atômicos separados para que:
 * - Mudanças em `games` (novo snapshot Firestore) re-renderizem apenas quem consome este hook
 * - Mudanças em `searchQuery` (digitação) idem — sem afetar LibraryPage nem Header
 */
export function useFilteredGames(): Game[] {
  const games = useGamesStore((s) => s.games);
  const searchQuery = useGamesStore((s) => s.searchQuery);

  return useMemo(() => {
    const ps2Games = games.filter((g) => isPs2Platform(g.platform));
    const q = searchQuery.trim();
    if (!q) return ps2Games;
    const lower = q.toLowerCase();
    return ps2Games.filter(
      (g) =>
        g.name.toLowerCase().includes(lower) ||
        g.platform.toLowerCase().includes(lower)
    );
  }, [games, searchQuery]);
}
