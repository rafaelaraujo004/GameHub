import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore, useGamesStore, useToastStore } from '../store';
import { isPs2Platform } from '../utils';
import {
  setFavorite,
  setRating,
  subscribeFavorites,
  subscribeRatingsByOwner,
  subscribeSignals,
  trackSignal,
  type FavoriteItem,
  type RatingItem,
  type SignalItem,
} from '../services/engagement';
import type { Game } from '../types';

export type CatalogGame = Game & {
  recommendationScore: number;
  averageRating: number;
  userRating: number;
  favorite: boolean;
  views: number;
  plays: number;
};

function daysSince(timestamp: number): number {
  return (Date.now() - timestamp) / (24 * 60 * 60 * 1000);
}

function recencyBoost(timestamp: number): number {
  const d = Math.max(0, daysSince(timestamp));
  return Math.exp(-d / 30);
}

function dedupeById(games: CatalogGame[]): CatalogGame[] {
  const map = new Map<string, CatalogGame>();
  for (const game of games) {
    if (!map.has(game.id)) map.set(game.id, game);
  }
  return Array.from(map.values());
}

export function useCatalogInsights() {
  const user = useAuthStore((s) => s.user);
  const games = useGamesStore((s) => s.games);
  const searchQuery = useGamesStore((s) => s.searchQuery);
  const addToast = useToastStore((s) => s.addToast);

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [ratings, setRatingsState] = useState<RatingItem[]>([]);
  const [signals, setSignalsState] = useState<SignalItem[]>([]);
  const [engagementEnabled, setEngagementEnabled] = useState(true);
  const permissionToastShownRef = useRef(false);

  const isPermissionDenied = useCallback((error: unknown): boolean => {
    return (error as { code?: string })?.code === 'permission-denied';
  }, []);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setRatingsState([]);
      setSignalsState([]);
      setEngagementEnabled(true);
      permissionToastShownRef.current = false;
      return;
    }

    const onError = (err: Error) => {
      if (isPermissionDenied(err)) {
        setEngagementEnabled(false);
        setFavorites([]);
        setRatingsState([]);
        setSignalsState([]);
        if (!permissionToastShownRef.current) {
          permissionToastShownRef.current = true;
          addToast('Recursos de favoritos e ranking aguardando publicacao das regras do Firestore.', 'info');
        }
        return;
      }

      console.error(err);
      addToast('Falha ao sincronizar recursos personalizados do catalogo.', 'error');
    };

    const unsubs = [
      subscribeFavorites(user.uid, setFavorites, onError),
      subscribeRatingsByOwner(user.uid, setRatingsState, onError),
      subscribeSignals(user.uid, setSignalsState, onError),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [user, addToast, isPermissionDenied]);

  const favoriteSet = useMemo(() => new Set(favorites.map((f) => f.gameId)), [favorites]);

  const userRatings = useMemo(() => {
    const map = new Map<string, number>();
    if (!user) return map;
    for (const r of ratings) {
      if (r.userId === user.uid) map.set(r.gameId, r.score);
    }
    return map;
  }, [ratings, user]);

  const avgRatings = useMemo(() => {
    const temp = new Map<string, { sum: number; count: number }>();
    for (const r of ratings) {
      const prev = temp.get(r.gameId) ?? { sum: 0, count: 0 };
      prev.sum += r.score;
      prev.count += 1;
      temp.set(r.gameId, prev);
    }

    const map = new Map<string, number>();
    for (const [gameId, { sum, count }] of temp) {
      map.set(gameId, count > 0 ? sum / count : 0);
    }
    return map;
  }, [ratings]);

  const signalMap = useMemo(() => {
    const map = new Map<string, SignalItem>();
    for (const s of signals) map.set(s.gameId, s);
    return map;
  }, [signals]);

  const catalogGames = useMemo(() => {
    return games
      .filter((g) => isPs2Platform(g.platform))
      .map((g) => {
        const averageRating = avgRatings.get(g.id) ?? 0;
        const userRating = userRatings.get(g.id) ?? 0;
        const favorite = favoriteSet.has(g.id);
        const signal = signalMap.get(g.id);
        const views = signal?.views ?? 0;
        const plays = signal?.plays ?? 0;
        const activity = Math.min(1, Math.log1p(views + plays * 2) / Math.log(15));
        const freshness = recencyBoost(signal?.lastInteractedAt ?? g.updatedAt);
        const metadataCompleteness = (g.description ? 0.5 : 0) + ((g.coverUrl || g.metadataCoverUrl) ? 0.5 : 0);

        const recommendationScore =
          (averageRating / 5) * 0.35 +
          (userRating / 5) * 0.25 +
          (favorite ? 0.2 : 0) +
          activity * 0.15 +
          freshness * 0.03 +
          metadataCompleteness * 0.02;

        return {
          ...g,
          recommendationScore,
          averageRating,
          userRating,
          favorite,
          views,
          plays,
        } satisfies CatalogGame;
      });
  }, [games, avgRatings, userRatings, favoriteSet, signalMap]);

  const searchedGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogGames;

    return catalogGames.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      (g.description ?? '').toLowerCase().includes(q)
    );
  }, [catalogGames, searchQuery]);

  const recommended = useMemo(
    () => [...searchedGames].sort((a, b) => b.recommendationScore - a.recommendationScore),
    [searchedGames]
  );

  const favoritesRail = useMemo(
    () => searchedGames.filter((g) => g.favorite),
    [searchedGames]
  );

  const topRated = useMemo(
    () => [...searchedGames].sort((a, b) => b.averageRating - a.averageRating || b.userRating - a.userRating),
    [searchedGames]
  );

  const trending = useMemo(
    () => [...searchedGames].sort((a, b) => (b.plays * 2 + b.views) - (a.plays * 2 + a.views)),
    [searchedGames]
  );

  const newlyAdded = useMemo(
    () => [...searchedGames].sort((a, b) => b.createdAt - a.createdAt),
    [searchedGames]
  );

  const hero = recommended[0] ?? newlyAdded[0] ?? null;

  const setGameFavorite = useCallback(async (gameId: string, favorite: boolean) => {
    if (!user || !engagementEnabled) return;
    try {
      await setFavorite(user.uid, gameId, favorite);
    } catch (error) {
      if (isPermissionDenied(error)) {
        setEngagementEnabled(false);
        return;
      }
      throw error;
    }
  }, [user, engagementEnabled, isPermissionDenied]);

  const setGameRating = useCallback(async (gameId: string, score: number, comment = '') => {
    if (!user || !engagementEnabled) return;
    try {
      await setRating(user.uid, user.uid, gameId, score, comment);
    } catch (error) {
      if (isPermissionDenied(error)) {
        setEngagementEnabled(false);
        return;
      }
      throw error;
    }
  }, [user, engagementEnabled, isPermissionDenied]);

  const trackPlay = useCallback(async (gameId: string) => {
    if (!user || !engagementEnabled) return;
    try {
      await trackSignal(user.uid, gameId, 'play');
    } catch (error) {
      if (isPermissionDenied(error)) {
        setEngagementEnabled(false);
        return;
      }
      throw error;
    }
  }, [user, engagementEnabled, isPermissionDenied]);

  const trackView = useCallback(async (gameId: string) => {
    if (!user || !engagementEnabled) return;
    try {
      await trackSignal(user.uid, gameId, 'view');
    } catch (error) {
      if (isPermissionDenied(error)) {
        setEngagementEnabled(false);
        return;
      }
      throw error;
    }
  }, [user, engagementEnabled, isPermissionDenied]);

  return {
    hero,
    all: searchedGames,
    recommended: dedupeById(recommended),
    favorites: dedupeById(favoritesRail),
    topRated: dedupeById(topRated),
    trending: dedupeById(trending),
    newlyAdded: dedupeById(newlyAdded),
    setGameFavorite,
    setGameRating,
    trackPlay,
    trackView,
  };
}
