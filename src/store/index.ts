import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { Game } from '../types';
import type { LaunchStatus } from '../types';
import type { LauncherJob } from '../services/launcher';

interface AuthState {
  user: User | null;
  authLoading: boolean;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
}

interface GamesState {
  games: Game[];
  gamesLoading: boolean;
  error: string | null;
  searchQuery: string;
  setGames: (games: Game[]) => void;
  setGamesLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  addGameOptimistic: (game: Game) => void;
  removeGameOptimistic: (id: string) => void;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
}

interface LauncherState {
  launchStatus: LaunchStatus;
  pcsx2Path: string | null;
  setLaunchStatus: (status: LaunchStatus) => void;
  setPCSX2Path: (path: string | null) => void;
}

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authLoading: true,
  setUser: (user) => set({ user }),
  setAuthLoading: (loading) => set({ authLoading: loading }),
}));

export const useGamesStore = create<GamesState>((set) => ({
  games: [],
  gamesLoading: true,
  error: null,
  searchQuery: '',
  setGames: (games) => set({ games }),
  setGamesLoading: (loading) => set({ gamesLoading: loading }),
  setError: (error) => set({ error }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  addGameOptimistic: (game) =>
    set((state) => ({ games: [game, ...state.games] })),
  removeGameOptimistic: (id) =>
    set((state) => ({ games: state.games.filter((g) => g.id !== id) })),
}));

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const useLauncherStore = create<LauncherState>((set) => ({
  launchStatus: 'idle',
  pcsx2Path: null,
  setLaunchStatus: (status) => set({ launchStatus: status }),
  setPCSX2Path: (path) => set({ pcsx2Path: path }),
}));

// ─── Downloads store ────────────────────────────────────────────────────────

export type ActiveDownload = {
  jobId: string;
  gameName: string;
  job: LauncherJob;
  startedAt: number;
};

export type DownloadHistoryEntry = {
  jobId: string;
  gameName: string;
  startedAt: number;
  completedAt: number;
  phase: 'completed' | 'error';
  error?: string;
};

interface DownloadsState {
  active: ActiveDownload[];
  history: DownloadHistoryEntry[];
  addActiveJob: (jobId: string, gameName: string) => void;
  updateActiveJob: (jobId: string, job: LauncherJob) => void;
  finishActiveJob: (jobId: string, job: LauncherJob) => void;
  clearHistory: () => void;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  active: [],
  history: [],
  addActiveJob: (jobId, gameName) =>
    set((s) => ({
      active: [
        ...s.active,
        {
          jobId,
          gameName,
          job: { id: jobId, phase: 'preparing', progress: 0, speedMbps: 0, etaSeconds: null, message: 'Preparando...' },
          startedAt: Date.now(),
        },
      ],
    })),
  updateActiveJob: (jobId, job) =>
    set((s) => ({
      active: s.active.map((item) => (item.jobId === jobId ? { ...item, job } : item)),
    })),
  finishActiveJob: (jobId, job) => {
    const found = get().active.find((a) => a.jobId === jobId);
    if (!found) return;
    const entry: DownloadHistoryEntry = {
      jobId,
      gameName: found.gameName,
      startedAt: found.startedAt,
      completedAt: Date.now(),
      phase: job.phase === 'completed' ? 'completed' : 'error',
      error: job.error,
    };
    set((s) => ({
      active: s.active.filter((a) => a.jobId !== jobId),
      history: [entry, ...s.history.slice(0, 49)],
    }));
  },
  clearHistory: () => set({ history: [] }),
}));
