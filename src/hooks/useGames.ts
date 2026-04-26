import { useEffect } from 'react';
import { subscribeToGames } from '../services/games';
import { useAuthStore, useGamesStore, useToastStore } from '../store';
import { logError } from '../utils/logger';
import { getFirebaseErrorMessage, isPermissionDenied } from '../utils/firebaseError';

/**
 * Gerencia a subscription do Firestore. Não retorna `games` — consuma-os
 * via `useGamesStore` com seletores granulares nos componentes que precisam,
 * evitando re-renders em cascata por mudanças não relacionadas no store.
 */
export function useGames(): void {
  const user = useAuthStore((s) => s.user);
  // Seletores atômicos: cada um só dispara re-render quando seu valor muda.
  // As funções setter são referências estáveis em Zustand (nunca mudam).
  const setGames = useGamesStore((s) => s.setGames);
  const setGamesLoading = useGamesStore((s) => s.setGamesLoading);
  const setError = useGamesStore((s) => s.setError);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setGamesLoading(false);
      return;
    }

    setGamesLoading(true);

    const unsubscribe = subscribeToGames(
      user.uid,
      (fetchedGames) => {
        setGames(fetchedGames);
        setGamesLoading(false);
      },
      (err) => {
        logError('useGames.subscribeToGames', err, {
          userId: user.uid,
        });
        const message = getFirebaseErrorMessage(err);
        setError(isPermissionDenied(err) ? 'Sem permissao para acessar seus jogos no Firestore.' : 'Erro ao carregar jogos. Tente novamente.');
        addToast(message, 'error');
        setGamesLoading(false);
      }
    );

    return unsubscribe;
  }, [user, setGames, setGamesLoading, setError, addToast]);
}
