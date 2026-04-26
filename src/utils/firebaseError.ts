type FirebaseLikeError = {
  code?: string;
  message?: string;
};

export function isPermissionDenied(error: unknown): boolean {
  return (error as FirebaseLikeError)?.code === 'permission-denied';
}

export function getFirebaseErrorMessage(error: unknown): string {
  const code = (error as FirebaseLikeError)?.code;

  if (isPermissionDenied(error)) {
    return 'Sem permissao no Firestore. Revise as regras de seguranca do projeto.';
  }

  if (code === 'auth/invalid-api-key') {
    return 'Firebase invalido no deploy. Verifique VITE_FIREBASE_API_KEY no Vercel.';
  }

  if (code === 'auth/unauthorized-domain') {
    return 'Dominio nao autorizado no Firebase Auth. Adicione seu dominio do Vercel em Authentication > Settings > Authorized domains.';
  }

  if (code === 'auth/popup-blocked') {
    return 'Popup de login bloqueado pelo navegador. Permita popups e tente novamente.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Falha de rede ao autenticar. Verifique conexao e tente novamente.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Login com Google desativado no Firebase. Ative em Authentication > Sign-in method.';
  }

  if ((error as FirebaseLikeError)?.message?.includes('Firebase nao configurado no ambiente')) {
    return 'Firebase nao configurado no ambiente de deploy. Defina as variaveis VITE_FIREBASE_* no Vercel.';
  }

  return 'Erro ao comunicar com o Firebase. Tente novamente.';
}
