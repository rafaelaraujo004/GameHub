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

export function isLocalGamePath(value: string): boolean {
  return /^[a-zA-Z]:\\/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

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
      throw new Error('Launcher local demorou para responder.', { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function startSmartLaunch(input: {
  name: string;
  link: string;
  metadataId?: string;
}): Promise<string> {
  const payload = isLocalGamePath(input.link)
    ? {
      name: input.name,
      gamePath: input.link,
      metadataId: input.metadataId ?? '',
    }
    : {
      name: input.name,
      downloadUrl: input.link,
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

  // Launcher conhecido como offline → retorna vazio sem fazer fetch (sem erro no console)
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
