import { useEffect } from 'react';
import { onAuthChange } from '../services/auth';
import { useAuthStore } from '../store';

export function useAuth() {
  const { user, authLoading, setUser, setAuthLoading } = useAuthStore();

  useEffect(() => {
    const loadingTimeout = window.setTimeout(() => {
      setAuthLoading(false);
    }, 8000);

    const unsubscribe = onAuthChange((firebaseUser) => {
      window.clearTimeout(loadingTimeout);
      setUser(firebaseUser);
      setAuthLoading(false);
    });

    return () => {
      window.clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, [setUser, setAuthLoading]);

  return { user, authLoading };
}
