import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRuntimeLauncherDir() {
  const hasPkg = Boolean(process?.pkg);
  return hasPkg ? path.dirname(process.execPath) : __dirname;
}

const RUNTIME_LAUNCHER_DIR = getRuntimeLauncherDir();
const CONFIG_PATH = path.join(RUNTIME_LAUNCHER_DIR, 'config.json');
const CACHE_PATH = path.join(RUNTIME_LAUNCHER_DIR, 'games_cache.json');
const METADATA_CACHE_PATH = path.join(RUNTIME_LAUNCHER_DIR, 'metadata_cache.json');
const METADATA_CACHE_VERSION = 'ps2-v2';
const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_GAME_EXTENSIONS = new Set(['.iso', '.bin', '.img', '.chd', '.cue', '.mdf', '.nrg', '.cso', '.zso', '.isz', '.elf']);
const EMULATOR_CANDIDATE_NAMES = ['pcsx2-qt.exe', 'pcsx2.exe'];
const MAX_EMULATOR_SEARCH_DEPTH = 5;
const MAX_EMULATOR_SCANNED_DIRS = 3000;
const JOB_TTL_MS = 10 * 60 * 1000;
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;

const jobs = new Map();
let igdbTokenCache = { token: '', expiresAt: 0 };
let emulatorPathCache = '';

function log(level, message, extra = '') {
  const timestamp = new Date().toISOString();
  const suffix = extra ? ` | ${extra}` : '';
  console.log(`[${timestamp}] [${level}] ${message}${suffix}`);
}

function respondJson(res, statusCode, payload, origin) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Vary', 'Origin');
  }

  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function isLoopbackAddress(remoteAddress) {
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

function isAbsoluteWindowsPath(value) {
  return /^[a-zA-Z]:\\/.test(value) || /^\\\\[^\\]+\\[^\\]+/.test(value);
}

async function pathExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const rawPath of paths) {
    const normalized = String(rawPath ?? '').trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function getDefaultEmulatorSearchRoots(configuredPath, extraRoots = []) {
  const userProfile = process.env.USERPROFILE || '';
  const roots = [
    path.dirname(configuredPath),
    process.env.ProgramFiles || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    process.env.LOCALAPPDATA || (userProfile ? path.join(userProfile, 'AppData', 'Local') : ''),
    userProfile ? path.join(userProfile, 'Documents') : '',
    userProfile ? path.join(userProfile, 'Downloads') : '',
    userProfile ? path.join(userProfile, 'Desktop') : '',
    ...extraRoots,
  ];

  return uniquePaths(roots.filter((root) => root && isAbsoluteWindowsPath(root)));
}

function findWithWhere() {
  const found = [];

  for (const bin of ['pcsx2-qt.exe', 'pcsx2.exe', 'pcsx2-qt', 'pcsx2']) {
    const result = spawnSync('where', [bin], {
      windowsHide: true,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    if (result.status !== 0 || !result.stdout) continue;

    const paths = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.toLowerCase().endsWith('.exe'));

    found.push(...paths);
  }

  return uniquePaths(found);
}

async function findExecutableInRoots(roots, executableNames) {
  const lowerNames = executableNames.map((name) => name.toLowerCase());
  const queue = roots.map((root) => ({ dir: root, depth: 0 }));
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_EMULATOR_SCANNED_DIRS) {
    const current = queue.shift();
    if (!current) continue;
    const { dir, depth } = current;
    scanned += 1;

    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile() && lowerNames.includes(entry.name.toLowerCase())) {
        return path.join(dir, entry.name);
      }
    }

    if (depth >= MAX_EMULATOR_SEARCH_DEPTH) continue;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childName = entry.name.toLowerCase();
      if (childName === 'windows' || childName === '$recycle.bin' || childName === 'system volume information') {
        continue;
      }
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }

  return '';
}

async function resolveEmulatorExecutable(configuredPath, extraRoots = []) {
  if (emulatorPathCache && await pathExists(emulatorPathCache)) {
    return emulatorPathCache;
  }

  if (await pathExists(configuredPath)) {
    emulatorPathCache = configuredPath;
    return configuredPath;
  }

  const configuredName = path.basename(configuredPath).toLowerCase();
  const configuredDir = path.dirname(configuredPath);
  const candidates = [];

  if (configuredName === 'pcsx2.exe') {
    candidates.push(path.join(configuredDir, 'pcsx2-qt.exe'));
  }
  if (configuredName === 'pcsx2-qt.exe') {
    candidates.push(path.join(configuredDir, 'pcsx2.exe'));
  }

  candidates.push(
    'C:\\Program Files\\PCSX2\\pcsx2-qt.exe',
    'C:\\Program Files\\PCSX2\\pcsx2.exe',
    'C:\\Program Files (x86)\\PCSX2\\pcsx2-qt.exe',
    'C:\\Program Files (x86)\\PCSX2\\pcsx2.exe',
    ...findWithWhere()
  );

  for (const candidate of uniquePaths(candidates)) {
    if (await pathExists(candidate)) {
      emulatorPathCache = candidate;
      return candidate;
    }
  }

  const roots = getDefaultEmulatorSearchRoots(configuredPath, extraRoots);
  const discovered = await findExecutableInRoots(roots, EMULATOR_CANDIDATE_NAMES);
  if (discovered) {
    emulatorPathCache = discovered;
    return discovered;
  }

  throw new Error(`Emulador nao encontrado automaticamente. Caminho configurado: ${configuredPath}. Ajuste launcher/config.json -> emulatorPath ou adicione emulatorSearchRoots.`);
}

async function ensureFile(filePath, initialContent) {
  try {
    await stat(filePath);
  } catch {
    await writeFile(filePath, initialContent, 'utf-8');
  }
}

function now() {
  return Date.now();
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPs2PlatformName(value) {
  const normalized = normalizeName(value);
  return (
    normalized === 'ps2' ||
    normalized === 'ps 2' ||
    normalized.includes('playstation 2') ||
    normalized.includes('play station 2')
  );
}

function sanitizeFileName(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return cleaned || `game-${Date.now()}`;
}

function deriveExtensionFromUrl(downloadUrl) {
  try {
    const parsed = new URL(downloadUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (ALLOWED_GAME_EXTENSIONS.has(ext)) {
      return ext;
    }
  } catch {
    return '.iso';
  }

  return '.iso';
}

function isValidDownloadUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }
    return parsed;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

async function loadGameCache() {
  const data = await readJsonFile(CACHE_PATH, { games: [] });
  if (!Array.isArray(data.games)) {
    return { games: [] };
  }
  return data;
}

async function saveGameCache(cache) {
  await writeJsonFile(CACHE_PATH, cache);
}

async function upsertCacheEntry(entry) {
  const cache = await loadGameCache();
  const index = cache.games.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    cache.games[index] = { ...cache.games[index], ...entry };
  } else {
    cache.games.push(entry);
  }
  await saveGameCache(cache);
}

function getJob(jobId) {
  return jobs.get(jobId);
}

function setJob(jobId, patch) {
  const current = jobs.get(jobId);
  if (!current) return;
  const updated = {
    ...current,
    ...patch,
    updatedAt: now(),
  };
  jobs.set(jobId, updated);
}

function createJob(initialPayload) {
  const jobId = randomUUID();
  const job = {
    id: jobId,
    status: 'ok',
    phase: 'preparing',
    progress: 0,
    speedMbps: 0,
    etaSeconds: null,
    message: 'Preparando...',
    error: '',
    payload: initialPayload,
    createdAt: now(),
    updatedAt: now(),
  };
  jobs.set(jobId, job);
  return job;
}

function finishJob(jobId) {
  setTimeout(() => {
    jobs.delete(jobId);
  }, JOB_TTL_MS).unref();
}

async function loadConfig() {
  const raw = await readFile(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config invalida.');
  }

  const emulatorPath = String(parsed.emulatorPath ?? '').trim();
  if (!isAbsoluteWindowsPath(emulatorPath)) {
    throw new Error('emulatorPath deve ser um caminho absoluto do Windows.');
  }

  const gamesDir = String(parsed.gamesDir ?? 'C:\\GameHub\\games').trim();
  if (!isAbsoluteWindowsPath(gamesDir)) {
    throw new Error('gamesDir deve ser um caminho absoluto do Windows.');
  }

  const port = Number(parsed.port ?? 3001);
  const host = typeof parsed.host === 'string' && parsed.host.trim() ? parsed.host.trim() : '127.0.0.1';
  const allowedOrigins = Array.isArray(parsed.allowedOrigins)
    ? parsed.allowedOrigins.filter((origin) => typeof origin === 'string' && origin.trim())
    : [];

  const igdb = parsed.igdb && typeof parsed.igdb === 'object'
    ? {
      clientId: String(parsed.igdb.clientId ?? '').trim(),
      clientSecret: String(parsed.igdb.clientSecret ?? '').trim(),
    }
    : { clientId: '', clientSecret: '' };

  const rawg = parsed.rawg && typeof parsed.rawg === 'object'
    ? {
      apiKey: String(parsed.rawg.apiKey ?? '').trim(),
    }
    : { apiKey: '' };

  const emulatorArgs = Array.isArray(parsed.emulatorArgs)
    ? parsed.emulatorArgs
      .filter((arg) => typeof arg === 'string')
      .map((arg) => arg.trim())
      .filter(Boolean)
    : [];

  const emulatorSearchRoots = Array.isArray(parsed.emulatorSearchRoots)
    ? parsed.emulatorSearchRoots
      .filter((root) => typeof root === 'string')
      .map((root) => root.trim())
      .filter((root) => root && isAbsoluteWindowsPath(root))
    : [];

  const rawBoot = parsed.boot && typeof parsed.boot === 'object' ? parsed.boot : {};
  const modeValue = String(rawBoot.mode ?? 'auto').trim().toLowerCase();
  const mode = modeValue === 'gui' || modeValue === 'nogui' || modeValue === 'auto'
    ? modeValue
    : 'auto';
  const boot = {
    mode,
    fullscreen: Boolean(rawBoot.fullscreen ?? false),
    fastBoot: Boolean(rawBoot.fastBoot ?? false),
  };

  return { emulatorPath, emulatorArgs, emulatorSearchRoots, boot, gamesDir, port, host, allowedOrigins, igdb, rawg };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let received = 0;

    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
        return;
      }

      data += chunk.toString('utf-8');
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(data || '{}');
        resolve(parsed);
      } catch {
        reject(new Error('JSON invalido.'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

function sanitizeGamePath(inputPath) {
  let gamePath = String(inputPath ?? '').trim();

  // Aceita caminho copiado com aspas e converte barras para padrao Windows.
  if (
    (gamePath.startsWith('"') && gamePath.endsWith('"')) ||
    (gamePath.startsWith("'") && gamePath.endsWith("'"))
  ) {
    gamePath = gamePath.slice(1, -1).trim();
  }

  // Aceita formato file:///C:/...
  if (gamePath.toLowerCase().startsWith('file:///')) {
    try {
      gamePath = fileURLToPath(new URL(gamePath));
    } catch {
      // Mantem valor original para erro de validacao logo abaixo.
    }
  }

  gamePath = gamePath.replace(/\//g, '\\');

  if (!isAbsoluteWindowsPath(gamePath)) {
    throw new Error('gamePath deve ser um caminho absoluto do Windows.');
  }

  return gamePath;
}

function assertAllowedGameExtension(gamePath) {
  const extension = path.extname(gamePath).toLowerCase();
  if (!ALLOWED_GAME_EXTENSIONS.has(extension)) {
    throw new Error(`Formato de jogo nao permitido (${extension || 'sem extensao'}). Use ISO, BIN, IMG, CHD, CUE, MDF, NRG, CSO, ZSO, ISZ ou ELF.`);
  }

  return gamePath;
}

function chooseBestLocalGameFile(candidatePaths, preferredName) {
  if (candidatePaths.length === 0) return '';
  if (candidatePaths.length === 1) return candidatePaths[0];

  const normalizedPreferred = normalizeName(preferredName);
  if (!normalizedPreferred) {
    return [...candidatePaths].sort((a, b) => a.localeCompare(b))[0];
  }

  const scored = candidatePaths.map((candidate) => {
    const base = path.basename(candidate, path.extname(candidate));
    const normalizedBase = normalizeName(base);

    let score = 0;
    if (normalizedBase === normalizedPreferred) score += 100;
    if (normalizedBase.includes(normalizedPreferred)) score += 40;
    if (normalizedPreferred.includes(normalizedBase)) score += 20;

    const preferredTokens = normalizedPreferred.split(' ').filter(Boolean);
    for (const token of preferredTokens) {
      if (normalizedBase.includes(token)) score += 3;
    }

    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate));
  return scored[0].candidate;
}

async function resolveLocalGamePath(inputPath, preferredName) {
  const sanitizedPath = sanitizeGamePath(inputPath);

  let info;
  try {
    info = await stat(sanitizedPath);
  } catch {
    throw new Error('Arquivo ou pasta do jogo nao encontrado.');
  }

  if (info.isFile()) {
    return assertAllowedGameExtension(sanitizedPath);
  }

  if (!info.isDirectory()) {
    throw new Error('gamePath local deve apontar para um arquivo ou pasta.');
  }

  const entries = await readdir(sanitizedPath, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sanitizedPath, entry.name))
    .filter((fullPath) => ALLOWED_GAME_EXTENSIONS.has(path.extname(fullPath).toLowerCase()));

  if (candidates.length === 0) {
    throw new Error('Nenhum arquivo de jogo encontrado na pasta. Use ISO, BIN, IMG, CHD, CUE, MDF, NRG, CSO, ZSO, ISZ ou ELF.');
  }

  const selected = chooseBestLocalGameFile(candidates, preferredName);
  if (!selected) {
    throw new Error('Nao foi possivel selecionar automaticamente um arquivo de jogo na pasta informada.');
  }

  return selected;
}

function sanitizePlayPayload(body) {
  const name = String(body.name ?? '').trim();
  const downloadUrl = String(body.downloadUrl ?? '').trim();
  const gamePath = String(body.gamePath ?? '').trim();
  const metadataId = String(body.metadataId ?? '').trim();

  if (gamePath) {
    return {
      mode: 'local',
      name: name || path.basename(gamePath, path.extname(gamePath)),
      gamePath: sanitizeGamePath(gamePath),
      downloadUrl: '',
      metadataId,
    };
  }

  if (!name) {
    throw new Error('Nome do jogo e obrigatorio.');
  }

  if (!downloadUrl || !isValidDownloadUrl(downloadUrl)) {
    throw new Error('downloadUrl invalida. Use URL HTTP/HTTPS.');
  }

  return {
    mode: 'download',
    name,
    downloadUrl,
    metadataId,
  };
}

function isAllowedRoute(urlPath) {
  return (
    urlPath === '/play' ||
    urlPath.startsWith('/jobs/') ||
    urlPath === '/metadata/search' ||
    urlPath === '/pick-game-file'
  );
}

async function pickLocalGameFilePath() {
  return new Promise((resolve, reject) => {
    const filter =
      'Arquivos PS2 (*.iso;*.bin;*.img;*.chd;*.cue;*.mdf;*.nrg;*.cso;*.zso;*.isz;*.elf)|*.iso;*.bin;*.img;*.chd;*.cue;*.mdf;*.nrg;*.cso;*.zso;*.isz;*.elf|Todos os arquivos (*.*)|*.*';

    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      `$dialog.Filter = '${filter}'`,
      '$dialog.Multiselect = $false',
      '$dialog.CheckFileExists = $true',
      '$dialog.CheckPathExists = $true',
      '$result = $dialog.ShowDialog()',
      'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.FileName }',
    ].join('; ');

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    child.once('error', (error) => reject(error));

    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Falha ao abrir explorador de arquivos (${stderr.trim() || `exit ${code}`}).`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function buildEmulatorArgs(emulatorPath, gamePath, extraArgs = [], bootConfig = { mode: 'auto', fullscreen: false, fastBoot: false }) {
  const args = [];

  // Esta versao do PCSX2 so aceita o caminho do jogo, sem flags adicionais
  args.push(gamePath);

  return args;
}

async function launchEmulator(emulatorPath, gamePath, emulatorArgs = [], bootConfig = { mode: 'auto', fullscreen: false, fastBoot: false }) {
  return new Promise((resolve, reject) => {
    const args = buildEmulatorArgs(emulatorPath, gamePath, emulatorArgs, bootConfig);
    const child = spawn(emulatorPath, args, {
      detached: true,
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString('utf-8').trim();
      if (text) log('INFO', 'Emulator stdout', text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString('utf-8').trim();
      if (text) log('WARN', 'Emulator stderr', text);
    });

    child.once('error', (error) => {
      reject(error);
    });

    child.once('spawn', () => {
      log('INFO', 'Emulador iniciado', `${gamePath} | args=${JSON.stringify(args)}`);
      child.unref();
      resolve();
    });
  });
}

async function computeFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function streamDownload({
  downloadUrl,
  destinationPath,
  onProgress,
}) {
  const partialPath = `${destinationPath}.part`;
  const hasPartial = await pathExists(partialPath);
  let alreadyDownloaded = 0;

  if (hasPartial) {
    const info = await stat(partialPath);
    alreadyDownloaded = info.size;
  }

  const headers = {};
  if (alreadyDownloaded > 0) {
    headers.Range = `bytes=${alreadyDownloaded}-`;
  }

  const response = await fetch(downloadUrl, { headers });
  if (!(response.status === 200 || response.status === 206)) {
    throw new Error(`Falha ao baixar arquivo (HTTP ${response.status}).`);
  }

  const appendMode = response.status === 206 && alreadyDownloaded > 0;
  if (!appendMode) {
    alreadyDownloaded = 0;
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const totalBytes = contentLength > 0 ? alreadyDownloaded + contentLength : 0;

  await mkdir(path.dirname(destinationPath), { recursive: true });

  if (!response.body) {
    throw new Error('Resposta sem stream de download.');
  }

  const writable = createWriteStream(partialPath, {
    flags: appendMode ? 'a' : 'w',
  });

  const readable = Readable.fromWeb(response.body);
  let downloadedBytes = alreadyDownloaded;
  let lastUpdateAt = now();
  let lastBytes = downloadedBytes;

  await new Promise((resolve, reject) => {
    readable.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const currentTime = now();
      const elapsedMs = currentTime - lastUpdateAt;

      if (elapsedMs >= 250) {
        const deltaBytes = downloadedBytes - lastBytes;
        const speedBps = elapsedMs > 0 ? (deltaBytes / elapsedMs) * 1000 : 0;
        const etaSeconds = totalBytes > 0 && speedBps > 0
          ? Math.max(0, Math.round((totalBytes - downloadedBytes) / speedBps))
          : null;

        onProgress({
          downloadedBytes,
          totalBytes,
          progress: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
          speedMbps: speedBps / (1024 * 1024),
          etaSeconds,
        });

        lastUpdateAt = currentTime;
        lastBytes = downloadedBytes;
      }
    });

    readable.on('error', (error) => {
      writable.destroy();
      reject(error);
    });

    writable.on('error', (error) => {
      reject(error);
    });

    writable.on('finish', resolve);
    readable.pipe(writable);
  });

  onProgress({
    downloadedBytes,
    totalBytes,
    progress: 100,
    speedMbps: 0,
    etaSeconds: 0,
  });

  await rename(partialPath, destinationPath);
  const finalInfo = await stat(destinationPath);
  return finalInfo.size;
}

async function findCachedGame(cache, payload) {
  const normalizedTarget = normalizeName(payload.name);
  return cache.games.find((entry) => {
    const byUrl = payload.downloadUrl && entry.downloadUrl === payload.downloadUrl;
    const byName = normalizeName(entry.name) === normalizedTarget;
    return byUrl || byName;
  });
}

async function getIgdbAccessToken(config) {
  if (!config.igdb.clientId || !config.igdb.clientSecret) {
    throw new Error('IGDB nao configurado no launcher/config.json.');
  }

  if (igdbTokenCache.token && igdbTokenCache.expiresAt > now() + 30_000) {
    return igdbTokenCache.token;
  }

  const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.igdb.clientId,
      client_secret: config.igdb.clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Falha ao autenticar na Twitch/IGDB.');
  }

  const tokenData = await tokenResponse.json();
  igdbTokenCache = {
    token: tokenData.access_token,
    expiresAt: now() + Number(tokenData.expires_in ?? 0) * 1000,
  };

  return igdbTokenCache.token;
}

async function searchMetadataWithIgdb(config, queryText) {
  const accessToken = await getIgdbAccessToken(config);
  const query = `search "${queryText.replace(/"/g, '')}"; fields name,summary,cover.url,platforms.name; limit 8;`;

  const response = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': config.igdb.clientId,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'text/plain',
    },
    body: query,
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar metadados no IGDB (HTTP ${response.status}).`);
  }

  const rawResults = await response.json();
  const onlyPs2 = rawResults.filter((item) =>
    Array.isArray(item.platforms) && item.platforms.some((p) => isPs2PlatformName(p?.name))
  );

  return onlyPs2.map((item) => {
    const cover = item.cover?.url
      ? `https:${String(item.cover.url).replace('t_thumb', 't_cover_big')}`
      : '';

    return {
      id: `igdb_${item.id}`,
      name: item.name ?? '',
      description: item.summary ?? '',
      coverUrl: cover,
      platform: 'PS2',
    };
  });
}

async function searchMetadataWithRawg(config, queryText) {
  if (!config.rawg.apiKey) {
    throw new Error('RAWG nao configurado no launcher/config.json.');
  }

  const buildRawgSynopsis = (item) => {
    const parts = [];

    if (item.released) {
      parts.push(`Lancado em ${item.released}`);
    }

    if (Array.isArray(item.genres) && item.genres.length > 0) {
      const genres = item.genres
        .map((genre) => String(genre?.name ?? '').trim())
        .filter(Boolean)
        .slice(0, 3);
      if (genres.length > 0) {
        parts.push(`Generos: ${genres.join(', ')}`);
      }
    }

    if (typeof item.rating === 'number' && item.rating > 0) {
      const votes = Number(item.ratings_count ?? 0);
      const votesText = votes > 0 ? ` (${votes} avaliacoes)` : '';
      parts.push(`Nota RAWG: ${item.rating.toFixed(1)}/5${votesText}`);
    }

    if (item.esrb_rating?.name) {
      parts.push(`Classificacao: ${item.esrb_rating.name}`);
    }

    return parts.join(' | ');
  };

  const params = new URLSearchParams({
    key: config.rawg.apiKey,
    search: queryText,
    page_size: '8',
    platforms: '15',
  });

  const response = await fetch(`https://api.rawg.io/api/games?${params.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar metadados no RAWG (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload.results) ? payload.results : [];
  const onlyPs2 = items.filter((item) =>
    Array.isArray(item.platforms) && item.platforms.some((p) => isPs2PlatformName(p?.platform?.name))
  );

  return onlyPs2.map((item) => ({
    id: `rawg_${item.id}`,
    name: item.name ?? '',
    description: buildRawgSynopsis(item),
    coverUrl: item.background_image ?? '',
    platform: 'PS2',
  }));
}

async function searchMetadata(config, queryText) {
  const metadataCache = await readJsonFile(METADATA_CACHE_PATH, { items: [] });
  if (!Array.isArray(metadataCache.items)) {
    metadataCache.items = [];
  }

  const normalizedQuery = normalizeName(queryText);
  const preferredProvider = config.igdb.clientId && config.igdb.clientSecret ? 'igdb' : 'rawg';
  const cached = metadataCache.items.find(
    (item) =>
      item.version === METADATA_CACHE_VERSION &&
      item.query === normalizedQuery &&
      item.provider === preferredProvider &&
      now() - item.timestamp < METADATA_TTL_MS
  );
  if (cached) {
    return cached.results;
  }

  let provider = preferredProvider;
  let results = [];

  if (preferredProvider === 'igdb') {
    try {
      results = await searchMetadataWithIgdb(config, queryText);
      if (results.length === 0 && config.rawg.apiKey) {
        provider = 'rawg';
        results = await searchMetadataWithRawg(config, queryText);
      }
    } catch (error) {
      if (!config.rawg.apiKey) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      log('WARN', 'IGDB indisponivel. Usando RAWG como fallback.', reason);
      provider = 'rawg';
      results = await searchMetadataWithRawg(config, queryText);
    }
  } else {
    results = await searchMetadataWithRawg(config, queryText);
  }

  metadataCache.items = metadataCache.items.filter(
    (item) => now() - item.timestamp < METADATA_TTL_MS
  );
  metadataCache.items.push({
    version: METADATA_CACHE_VERSION,
    provider,
    query: normalizedQuery,
    timestamp: now(),
    results,
  });
  await writeJsonFile(METADATA_CACHE_PATH, metadataCache);

  return results;
}

async function processPlayJob(jobId, payload, config) {
  try {
    const emulatorPath = await resolveEmulatorExecutable(config.emulatorPath, config.emulatorSearchRoots);

    if (payload.mode === 'local') {
      const resolvedLocalPath = await resolveLocalGamePath(payload.gamePath, payload.name);

      setJob(jobId, {
        phase: 'launching',
        progress: 100,
        message: 'Iniciando emulador...',
      });

      await launchEmulator(emulatorPath, resolvedLocalPath, config.emulatorArgs, config.boot);
      setJob(jobId, {
        phase: 'completed',
        progress: 100,
        message: 'Jogo iniciado.',
      });
      finishJob(jobId);
      return;
    }

    const cache = await loadGameCache();
    const cached = await findCachedGame(cache, payload);

    if (cached && await pathExists(cached.localPath)) {
      setJob(jobId, {
        phase: 'launching',
        progress: 100,
        message: 'Jogo encontrado localmente. Iniciando...',
      });

      await launchEmulator(emulatorPath, cached.localPath, config.emulatorArgs, config.boot);
      cached.lastPlayed = now();
      await saveGameCache(cache);
      setJob(jobId, {
        phase: 'completed',
        progress: 100,
        message: 'Jogo iniciado instantaneamente.',
      });
      finishJob(jobId);
      return;
    }

    const extension = deriveExtensionFromUrl(payload.downloadUrl);
    const safeFile = `${sanitizeFileName(payload.name)}${extension}`;
    const localPath = cached?.localPath || path.join(config.gamesDir, safeFile);

    if (!cached && await pathExists(localPath)) {
      const info = await stat(localPath);
      const entry = {
        id: randomUUID(),
        name: payload.name,
        downloadUrl: payload.downloadUrl,
        localPath,
        fileSize: info.size,
        checksum: '',
        metadataId: payload.metadataId,
        lastPlayed: now(),
      };
      cache.games.push(entry);
      await saveGameCache(cache);

      setJob(jobId, {
        phase: 'launching',
        progress: 100,
        message: 'Jogo ja existe em disco. Iniciando...',
      });

      await launchEmulator(emulatorPath, localPath, config.emulatorArgs, config.boot);
      setJob(jobId, {
        phase: 'completed',
        progress: 100,
        message: 'Jogo iniciado instantaneamente.',
      });
      finishJob(jobId);
      return;
    }

    setJob(jobId, {
      phase: 'downloading',
      progress: 0,
      message: 'Baixando jogo...',
      speedMbps: 0,
      etaSeconds: null,
    });

    const fileSize = await streamDownload({
      downloadUrl: payload.downloadUrl,
      destinationPath: localPath,
      onProgress: ({ progress, speedMbps, etaSeconds }) => {
        setJob(jobId, {
          phase: 'downloading',
          progress: Math.max(0, Math.min(100, progress)),
          speedMbps: Number(speedMbps.toFixed(2)),
          etaSeconds,
          message: 'Baixando jogo...',
        });
      },
    });

    setJob(jobId, {
      phase: 'finalizing',
      progress: 100,
      speedMbps: 0,
      etaSeconds: 0,
      message: 'Verificando integridade...',
    });

    const computedChecksum = await computeFileChecksum(localPath);

    if (cached?.checksum && cached.checksum !== computedChecksum) {
      await unlink(localPath).catch(() => {});
      throw new Error('Falha na verificacao de integridade: checksum invalido. Arquivo removido, tente novamente.');
    }

    const entry = {
      id: cached?.id ?? randomUUID(),
      name: payload.name,
      downloadUrl: payload.downloadUrl,
      localPath,
      fileSize,
      checksum: computedChecksum,
      metadataId: payload.metadataId,
      lastPlayed: now(),
    };

    await upsertCacheEntry(entry);

    setJob(jobId, {
      phase: 'launching',
      message: 'Iniciando emulador...',
      progress: 100,
    });

    await launchEmulator(emulatorPath, localPath, config.emulatorArgs, config.boot);

    setJob(jobId, {
      phase: 'completed',
      progress: 100,
      message: 'Jogo iniciado.',
    });
    finishJob(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    log('ERROR', 'Falha no job de play', message);
    setJob(jobId, {
      phase: 'error',
      error: message,
      message,
    });
    finishJob(jobId);
  }
}

function selectAllowedOrigin(reqOrigin, allowedOrigins) {
  if (!reqOrigin) return '';

  let parsedOrigin;
  try {
    parsedOrigin = new URL(reqOrigin);
  } catch {
    return '';
  }

  const hostName = parsedOrigin.hostname.toLowerCase();
  const protocol = parsedOrigin.protocol;

  // Defaults seguros para funcionamento cross-machine sem ajuste manual de config
  if (protocol === 'http:' && (hostName === 'localhost' || hostName === '127.0.0.1')) {
    return reqOrigin;
  }

  if (protocol === 'https:' && hostName.endsWith('.vercel.app')) {
    return reqOrigin;
  }

  for (const allowedOrigin of allowedOrigins) {
    if (allowedOrigin === reqOrigin) return reqOrigin;

    // Suporta wildcard em subdominios HTTPS, ex: https://*.vercel.app
    if (allowedOrigin.startsWith('https://*.')) {
      const suffix = allowedOrigin.slice('https://*.'.length);
      if (reqOrigin.startsWith('https://') && reqOrigin.slice('https://'.length).endsWith(`.${suffix}`)) {
        return reqOrigin;
      }
    }
  }

  return '';
}

export async function start() {
  await ensureFile(CACHE_PATH, '{\n  "games": []\n}\n');
  await ensureFile(METADATA_CACHE_PATH, '{\n  "items": []\n}\n');

  const initialConfig = await loadConfig();
  const { host, port } = initialConfig;

  const server = createServer(async (req, res) => {
    const remoteAddress = req.socket.remoteAddress ?? '';
    if (!isLoopbackAddress(remoteAddress)) {
      respondJson(res, 403, { status: 'error', message: 'Acesso permitido apenas via localhost.' });
      return;
    }

    let config;
    try {
      config = await loadConfig();
    } catch (error) {
      log('ERROR', 'Falha ao carregar config.json', String(error));
      respondJson(res, 500, { status: 'error', message: 'Falha na configuracao do launcher.' });
      return;
    }

    const origin = selectAllowedOrigin(req.headers.origin, config.allowedOrigins);
    const parsedUrl = new URL(req.url ?? '/', `http://${host}:${port}`);
    const routePath = parsedUrl.pathname;

    if (req.method === 'OPTIONS' && isAllowedRoute(routePath)) {
      if (!origin) {
        respondJson(res, 403, { status: 'error', message: 'Origem nao autorizada.' });
        return;
      }

      const requestedPrivateNetwork = String(req.headers['access-control-request-private-network'] ?? '').toLowerCase() === 'true';
      const requestedHeadersRaw = String(req.headers['access-control-request-headers'] ?? '').trim();
      const allowedHeaders = requestedHeadersRaw || 'Content-Type';
      const preflightHeaders = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': allowedHeaders,
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      };

      if (requestedPrivateNetwork) {
        preflightHeaders['Access-Control-Allow-Private-Network'] = 'true';
      }

      res.writeHead(204, preflightHeaders);
      res.end();
      return;
    }

    if (!origin && req.headers.origin) {
      respondJson(res, 403, { status: 'error', message: 'Origem nao autorizada.' });
      return;
    }

    try {
      if (req.method === 'POST' && routePath === '/play') {
        const body = await readJsonBody(req);
        const payload = sanitizePlayPayload(body);
        const job = createJob(payload);

        respondJson(res, 200, {
          status: 'ok',
          jobId: job.id,
        }, origin);

        void processPlayJob(job.id, payload, config);
        return;
      }

      if (req.method === 'GET' && routePath.startsWith('/jobs/')) {
        const jobId = routePath.slice('/jobs/'.length);
        const job = getJob(jobId);
        if (!job) {
          respondJson(res, 404, { status: 'error', message: 'Job nao encontrado.' }, origin);
          return;
        }

        respondJson(res, 200, {
          status: 'ok',
          job,
        }, origin);
        return;
      }

      if (req.method === 'GET' && routePath === '/metadata/search') {
        const queryText = String(parsedUrl.searchParams.get('q') ?? '').trim();
        if (queryText.length < 2) {
          respondJson(res, 200, { status: 'ok', results: [] }, origin);
          return;
        }

        const results = await searchMetadata(config, queryText);
        respondJson(res, 200, { status: 'ok', results }, origin);
        return;
      }

      if (req.method === 'GET' && routePath === '/pick-game-file') {
        const pickedPathRaw = await pickLocalGameFilePath();

        if (!pickedPathRaw) {
          respondJson(res, 200, { status: 'cancelled' }, origin);
          return;
        }

        const pickedPath = sanitizeGamePath(pickedPathRaw);
        respondJson(res, 200, { status: 'ok', gamePath: pickedPath }, origin);
        return;
      }

      respondJson(res, 404, { status: 'error', message: 'Rota nao encontrada.' }, origin);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      log('ERROR', 'Requisicao falhou', message);

      const statusCode =
        message.includes('nao encontrado') ? 404 :
        message.includes('nao permitido') ? 400 :
        message.includes('absoluto') ? 400 :
        message.includes('JSON invalido') ? 400 :
        message.includes('Payload') ? 413 : 500;

      respondJson(res, statusCode, { status: 'error', message }, origin);
    }
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.listen(port, host, () => {
    log('INFO', `Launcher ouvindo em http://${host}:${port}`);
  });
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(__filename)
  : false;

if (isDirectRun || Boolean(process?.pkg)) {
  start().catch((error) => {
    log('ERROR', 'Erro fatal ao iniciar launcher', String(error));
    process.exit(1);
  });
}
