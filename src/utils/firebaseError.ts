type FirebaseLikeError = {
  code?: string;
};

export function isPermissionDenied(error: unknown): boolean {
  return (error as FirebaseLikeError)?.code === 'permission-denied';
}

export function getFirebaseErrorMessage(error: unknown): string {
  if (isPermissionDenied(error)) {
    return 'Sem permissao no Firestore. Revise as regras de seguranca do projeto.';
  }

  return 'Erro ao comunicar com o Firebase. Tente novamente.';
}
