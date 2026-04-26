import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Substitua com suas credenciais do Firebase Console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

function validateFirebaseConfig(config: typeof firebaseConfig): void {
  for (const key of requiredKeys) {
    const value = String(config[key] ?? '').trim();
    if (!value) {
      throw new Error(`Firebase config ausente: ${key}`);
    }
  }
}

let app: ReturnType<typeof initializeApp> | null = null;
export let firebaseInitError: string | null = null;

try {
  validateFirebaseConfig(firebaseConfig);
  app = initializeApp(firebaseConfig);
} catch (error) {
  firebaseInitError = error instanceof Error ? error.message : 'Falha ao inicializar Firebase.';
  console.error('[GameHub][Firebase] Inicializacao falhou', {
    message: firebaseInitError,
    hasApiKey: Boolean(firebaseConfig.apiKey),
    hasAuthDomain: Boolean(firebaseConfig.authDomain),
    hasProjectId: Boolean(firebaseConfig.projectId),
    hasStorageBucket: Boolean(firebaseConfig.storageBucket),
    hasMessagingSenderId: Boolean(firebaseConfig.messagingSenderId),
    hasAppId: Boolean(firebaseConfig.appId),
  });
}

export const auth = (app ? getAuth(app) : null) as unknown as ReturnType<typeof getAuth>;
export const db = (app ? getFirestore(app) : null) as unknown as ReturnType<typeof getFirestore>;
export const googleProvider = (app ? new GoogleAuthProvider() : null) as unknown as GoogleAuthProvider;
