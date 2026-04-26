import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { auth, googleProvider, firebaseInitError } from './firebase';
import { logError } from '../utils/logger';

function getFirebaseUnavailableError(): Error {
  return new Error(
    `Firebase nao configurado no ambiente. ${firebaseInitError ?? 'Defina as variaveis VITE_FIREBASE_* no deploy.'}`
  );
}

export async function loginWithGoogle(): Promise<User> {
  if (firebaseInitError) {
    throw getFirebaseUnavailableError();
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logout(): Promise<void> {
  if (firebaseInitError) return;
  await signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (firebaseInitError) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(
    auth,
    callback,
    (error) => {
      logError('auth.onAuthChange', error);
      callback(null);
    }
  );
}
