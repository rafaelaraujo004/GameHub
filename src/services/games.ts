import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Game, GameFormData } from '../types';
import { detectLinkType } from '../utils';

const COLLECTION = 'games';

export function subscribeToGames(
  userId: string,
  callback: (games: Game[]) => void,
  onError: (err: Error) => void
): () => void {
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const games: Game[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: data.userId,
          name: data.name,
          platform: data.platform,
          link: data.link,
          linkType: data.linkType,
          coverUrl: data.coverUrl ?? '',
          metadataCoverUrl: data.metadataCoverUrl ?? '',
          metadataId: data.metadataId ?? '',
          description: data.description ?? '',
          createdAt:
            data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : Date.now(),
          updatedAt:
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toMillis()
              : Date.now(),
        };
            }).sort((a, b) => b.createdAt - a.createdAt);
      callback(games);
    },
    (err) => onError(err as Error)
  );
}

export async function addGame(userId: string, formData: GameFormData): Promise<Game> {
  const now = serverTimestamp();
  const docRef = await addDoc(collection(db, COLLECTION), {
    userId,
    name: formData.name.trim(),
    platform: formData.platform.trim(),
    link: formData.link.trim(),
    linkType: detectLinkType(formData.link.trim()),
    coverUrl: formData.coverUrl.trim(),
    metadataCoverUrl: (formData.metadataCoverUrl ?? '').trim(),
    metadataId: (formData.metadataId ?? '').trim(),
    description: (formData.description ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  });

  return {
    id: docRef.id,
    userId,
    name: formData.name.trim(),
    platform: formData.platform.trim(),
    link: formData.link.trim(),
    linkType: detectLinkType(formData.link.trim()),
    coverUrl: formData.coverUrl.trim(),
    metadataCoverUrl: (formData.metadataCoverUrl ?? '').trim(),
    metadataId: (formData.metadataId ?? '').trim(),
    description: (formData.description ?? '').trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export async function deleteGame(gameId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, gameId));
}

export async function checkDuplicateName(userId: string, name: string): Promise<boolean> {
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  const snap = await getDocs(q);
  const target = name.trim().toLowerCase();
  return snap.docs.some((docSnap) => {
    const gameName = (docSnap.data().name as string | undefined)?.trim().toLowerCase();
    return gameName === target;
  });
}

export async function updateGame(gameId: string, formData: Partial<GameFormData>): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (formData.name !== undefined) updates.name = formData.name.trim();
  if (formData.platform !== undefined) updates.platform = formData.platform.trim();
  if (formData.link !== undefined) {
    updates.link = formData.link.trim();
    updates.linkType = detectLinkType(formData.link.trim());
  }
  if (formData.coverUrl !== undefined) updates.coverUrl = formData.coverUrl.trim();
  if (formData.metadataCoverUrl !== undefined) updates.metadataCoverUrl = formData.metadataCoverUrl.trim();
  if (formData.metadataId !== undefined) updates.metadataId = formData.metadataId.trim();
  if (formData.description !== undefined) updates.description = formData.description.trim();
  await updateDoc(doc(db, COLLECTION, gameId), updates);
}
