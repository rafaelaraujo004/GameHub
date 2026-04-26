type ErrorMeta = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : 'Erro desconhecido',
    raw: error,
  };
}

export function logError(context: string, error: unknown, meta?: ErrorMeta): void {
  console.error(`[GameHub][Error] ${context}`, {
    ...normalizeError(error),
    ...(meta ?? {}),
  });
}
