import type { Game, GameSource, LaunchResult } from '../types';
import { logError } from '../utils/logger';

const LAUNCHER_BASE_URL = 'http://127.0.0.1:3001';

// Quando o launcher está offline, evita flood de requisições por 30s após a primeira falha
let launcherOfflineUntil = 0;

function markLauncherOffline() {
  launcherOfflineUntil = Date.now() + 30_000;
}

function markLauncherOnline() {
  launcherOfflineUntil = 0;
}

type LauncherError = {
  status: 'error';
  message: string;
};

type StartJobResponse = {
  status: 'ok';
  jobId: string;
};

export type LauncherJobPhase =
  | 'preparing'
  | 'downloading'
  | 'finalizing'
  | 'launching'
  | 'completed'
  | 'error';

export type LauncherJob = {
  id: string;
  phase: LauncherJobPhase;
  progress: number;
  speedMbps: number;
  etaSeconds: number | null;
  message: string;
  error?: string;
};

type JobStatusResponse = {
  status: 'ok';
  job: LauncherJob;
};

export type MetadataSuggestion = {
  id: string;
  name: string;
  description: string;
  coverUrl: string;
  platform: string;
};

type MetadataResponse = {
  status: 'ok';
  results: MetadataSuggestion[];
};

type PickGameFileResponse =
  | { status: 'ok'; gamePath: string }
  | { status: 'cancelled' };

type IpcRendererLike = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

type DownloadDriveResponse = {
  success: boolean;
  error?: string;
  filePath?: string;
};

type EnsureLauncherRunningResponse = {
  running: boolean;
  started: boolean;
  error?: string;
};

function getElectronIpcRenderer(): IpcRendererLike | null {
  try {
    const maybeWindow = window as Window & {
      require?: (module: string) => unknown;
    };

    if (typeof maybeWindow.require !== 'function') {
      return null;
    }

    const electronModule = maybeWindow.require('electron') as { ipcRenderer?: IpcRendererLike };
    return electronModule?.ipcRenderer ?? null;
  } catch {
    return null;
  }
}

function isNetworkFetchError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return (
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('ERR_CONNECTION_REFUSED')
    );
  }
  return false;
}

function getLauncherOfflineMessage(): string {
  return `Nao foi possivel conectar ao launcher local (${LAUNCHER_BASE_URL}). Inicie com npm run launcher:start.`;
}

async function ensureLauncherRunningInBackground(): Promise<boolean> {
  const ipcRenderer = getElectronIpcRenderer();
  if (!ipcRenderer) return false;

  try {
    const result = (await ipcRenderer.invoke('ensure-launcher-running')) as EnsureLauncherRunningResponse;
    if (!result?.running && result?.error) {
      logError('launcher.ensureLauncherRunningInBackground', new Error(result.error), {
        started: result.started,
      });
    }
    return Boolean(result?.running);
  } catch (error) {
    logError('launcher.ensureLauncherRunningInBackground.invoke', error);
    return false;
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 6000, allowAutoStart = true): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : 'unknown-url';
  const requestMethod = init?.method ?? 'GET';

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const data = (await response.json()) as T | LauncherError;

    if (!response.ok) {
      throw new Error((data as LauncherError)?.message || 'Falha na comunicacao com launcher local.');
    }

    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      logError('launcher.fetchJson.timeout', error, {
        method: requestMethod,
        url: requestUrl,
      });
      throw new Error('Launcher local demorou para responder.', { cause: error });
    }

    if (isNetworkFetchError(error)) {
      logError('launcher.fetchJson.network', error, {
        method: requestMethod,
        url: requestUrl,
      });

      if (allowAutoStart) {
        const started = await ensureLauncherRunningInBackground();
        if (started) {
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          return fetchJson<T>(input, init, timeoutMs, false);
        }
      }

      throw new Error(getLauncherOfflineMessage(), { cause: error });
    }

    logError('launcher.fetchJson.unknown', error, {
      method: requestMethod,
      url: requestUrl,
    });
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function isLocalGamePath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

function deriveGameSource(game: Game): GameSource {
  if (game.linkType === 'drive' || game.link.includes('drive.google.com')) {
    return 'google_drive';
  }
  return 'local';
}

function buildDownloadFileName(game: Game): string {
  // eslint-disable-next-line no-control-regex
  const safeName = game.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ');
  return `${safeName || 'game'}.iso`;
}

export async function savePCSX2Path(path: string): Promise<void> {
  const normalized = path.trim();
  if (!normalized) {
    throw new Error('Caminho do PCSX2 invalido.');
  }

  const ipcRenderer = getElectronIpcRenderer();
  if (ipcRenderer) {
    await ipcRenderer.invoke('save-pcsx2-path', normalized);
  } else {
    // Fallback para localStorage quando IPC não está disponível (web puro)
    try {
      localStorage.setItem('gamehub_pcsx2_path', normalized);
    } catch (error) {
      // localStorage pode não estar disponível em alguns contextos
      logError('launcher.savePCSX2Path.localStorageFallback', error, { path: normalized });
    }
  }
}

export async function getPCSX2Path(): Promise<string | null> {
  const ipcRenderer = getElectronIpcRenderer();
  if (ipcRenderer) {
    const value = await ipcRenderer.invoke('get-pcsx2-path');
    return typeof value === 'string' && value.trim() ? value : null;
  }

  // Fallback para localStorage quando IPC não está disponível
  try {
    const value = localStorage.getItem('gamehub_pcsx2_path');
    return typeof value === 'string' && value.trim() ? value : null;
  } catch (error) {
    logError('launcher.getPCSX2Path.localStorageFallback', error);
    return null;
  }
}

export async function openFileDialog(): Promise<string | null> {
  const ipcRenderer = getElectronIpcRenderer();
  if (!ipcRenderer) return null;

  const result = await ipcRenderer.invoke('open-file-dialog');
  return typeof result === 'string' && result.trim() ? result : null;
}

export async function launchGame(game: Game): Promise<LaunchResult> {
  try {
    const ipcRenderer = getElectronIpcRenderer();
    const source = deriveGameSource(game);

    if (!ipcRenderer) {
      const jobId = await startSmartLaunch({
        name: game.name,
        link: game.link,
        metadataId: game.metadataId,
      });
      const finalJob = await waitForLaunchCompletion(jobId, () => undefined);
      if (finalJob.phase === 'error') {
        return {
          success: false,
          error: finalJob.error || finalJob.message || 'Falha ao iniciar jogo.',
        };
      }
      return { success: true };
    }

    const pcsx2Path = await getPCSX2Path();
    if (!pcsx2Path) {
      return {
        success: false,
        error: 'PCSX2 nao configurado. Defina o caminho nas configuracoes.',
      };
    }

    let gamePath = game.link;

    if (source === 'google_drive') {
      const download = (await ipcRenderer.invoke('download-drive-file', {
        downloadUrl: game.link,
        fileName: buildDownloadFileName(game),
      })) as DownloadDriveResponse;

      if (!download.success || !download.filePath) {
        return {
          success: false,
          error: download.error || 'Falha ao baixar arquivo do Google Drive.',
        };
      }

      gamePath = download.filePath;
    }

    const launchResult = (await ipcRenderer.invoke('launch-game', {
      gamePath,
      gameSource: source,
    })) as LaunchResult;

    if (!launchResult?.success) {
      return {
        success: false,
        error: launchResult?.error || 'Falha ao iniciar o PCSX2.',
      };
    }

    return { success: true };
  } catch (error) {
    const isNetwork = isNetworkFetchError(error);
    logError('launcher.launchGame', error, {
      gameId: game.id,
      gameName: game.name,
      gameLinkType: game.linkType,
    });
    return {
      success: false,
      error: isNetwork
        ? getLauncherOfflineMessage()
        : (error instanceof Error ? error.message : 'Falha inesperada ao iniciar o jogo.'),
    };
  }
}

export async function startSmartLaunch(input: {
  name: string;
  link: string;
  metadataId?: string;
}): Promise<string> {
  const localPath = isLocalGamePath(input.link) ? input.link : '';
  const remoteUrl = isLocalGamePath(input.link) ? '' : input.link;
  const payload = {
    name: input.name,
    gamePath: localPath,
    downloadUrl: remoteUrl,
    metadataId: input.metadataId ?? '',
  };

  const response = await fetchJson<StartJobResponse>(
    `${LAUNCHER_BASE_URL}/play`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    8000
  );

  return response.jobId;
}

export async function getLaunchJob(jobId: string): Promise<LauncherJob> {
  const response = await fetchJson<JobStatusResponse>(`${LAUNCHER_BASE_URL}/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
  }, 5000);

  return response.job;
}

export async function waitForLaunchCompletion(
  jobId: string,
  onUpdate: (job: LauncherJob) => void,
  timeoutMs = 30 * 60 * 1000
): Promise<LauncherJob> {
  const startedAt = Date.now();

  while (true) {
    const job = await getLaunchJob(jobId);
    onUpdate(job);

    if (job.phase === 'completed' || job.phase === 'error') {
      return job;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Tempo limite excedido aguardando launcher.');
    }

    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
}

export async function searchGameMetadata(query: string): Promise<MetadataSuggestion[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];

  // Launcher conhecido como offline -> retorna vazio sem fazer fetch (sem erro no console)
  if (Date.now() < launcherOfflineUntil) return [];

  try {
    const response = await fetchJson<MetadataResponse>(
      `${LAUNCHER_BASE_URL}/metadata/search?q=${encodeURIComponent(normalized)}`,
      { method: 'GET' },
      8000
    );
    markLauncherOnline();
    return response.results;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    logError('launcher.searchGameMetadata', error, {
      query: normalized,
    });
    const isOffline =
      message.includes('Failed to fetch') ||
      message.includes('demorou para responder') ||
      message.includes('NetworkError');
    if (isOffline) markLauncherOffline();
    return [];
  }
}

export async function pickLocalGamePath(): Promise<string | null> {
  const response = await fetchJson<PickGameFileResponse>(
    `${LAUNCHER_BASE_URL}/pick-game-file`,
    { method: 'GET' },
    120000
  );

  if (response.status !== 'ok') return null;
  return response.gamePath;
}
