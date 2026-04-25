import { useEffect } from 'react';
import { onAuthChange } from '../services/auth';
import { useAuthStore } from '../store';

export function useAuth() {
  const { user, authLoading, setUser, setAuthLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, [setUser, setAuthLoading]);

  return { user, authLoading };
}
