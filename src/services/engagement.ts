import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const FAVORITES_COLLECTION = 'favorites';
const RATINGS_COLLECTION = 'ratings';
const SIGNALS_COLLECTION = 'signals';

export type FavoriteItem = {
  id: string;
  userId: string;
  gameId: string;
  createdAt: number;
};

export type RatingItem = {
  id: string;
  userId: string;
  ownerId: string;
  gameId: string;
  score: number;
  comment: string;
  updatedAt: number;
};

export type SignalItem = {
  id: string;
  userId: string;
  gameId: string;
  views: number;
  plays: number;
  lastInteractedAt: number;
};

function toMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in (value as Timestamp)) {
    return (value as Timestamp).toMillis();
  }
  return Date.now();
}

function favoriteDocId(userId: string, gameId: string): string {
  return `${userId}_${gameId}`;
}

function ratingDocId(userId: string, gameId: string): string {
  return `${userId}_${gameId}`;
}

function signalDocId(userId: string, gameId: string): string {
  return `${userId}_${gameId}`;
}

export function subscribeFavorites(
  userId: string,
  callback: (favorites: FavoriteItem[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, FAVORITES_COLLECTION), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          gameId: data.gameId,
          createdAt: toMillis(data.createdAt),
        } satisfies FavoriteItem;
      });
      callback(items);
    },
    (err) => onError(err as Error)
  );
}

export function subscribeRatingsByOwner(
  ownerId: string,
  callback: (ratings: RatingItem[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, RATINGS_COLLECTION), where('ownerId', '==', ownerId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          ownerId: data.ownerId,
          gameId: data.gameId,
          score: Number(data.score ?? 0),
          comment: String(data.comment ?? ''),
          updatedAt: toMillis(data.updatedAt),
        } satisfies RatingItem;
      });
      callback(items);
    },
    (err) => onError(err as Error)
  );
}

export function subscribeSignals(
  userId: string,
  callback: (signals: SignalItem[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, SIGNALS_COLLECTION), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId,
          gameId: data.gameId,
          views: Number(data.views ?? 0),
          plays: Number(data.plays ?? 0),
          lastInteractedAt: toMillis(data.lastInteractedAt),
        } satisfies SignalItem;
      });
      callback(items);
    },
    (err) => onError(err as Error)
  );
}

export async function setFavorite(userId: string, gameId: string, favorite: boolean): Promise<void> {
  const ref = doc(db, FAVORITES_COLLECTION, favoriteDocId(userId, gameId));

  if (favorite) {
    await setDoc(ref, {
      userId,
      gameId,
      createdAt: serverTimestamp(),
    }, { merge: true });
    return;
  }

  await deleteDoc(ref);
}

export async function setRating(
  userId: string,
  ownerId: string,
  gameId: string,
  score: number,
  comment = ''
): Promise<void> {
  const clamped = Math.max(1, Math.min(5, Math.round(score)));
  const ref = doc(db, RATINGS_COLLECTION, ratingDocId(userId, gameId));

  await setDoc(ref, {
    userId,
    ownerId,
    gameId,
    score: clamped,
    comment: String(comment ?? '').trim(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function trackSignal(
  userId: string,
  gameId: string,
  kind: 'view' | 'play'
): Promise<void> {
  const ref = doc(db, SIGNALS_COLLECTION, signalDocId(userId, gameId));

  await setDoc(ref, {
    userId,
    gameId,
    views: kind === 'view' ? increment(1) : increment(0),
    plays: kind === 'play' ? increment(1) : increment(0),
    lastInteractedAt: serverTimestamp(),
  }, { merge: true });
}
