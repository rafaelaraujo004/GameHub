import net from 'node:net';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(__dirname, 'config.json');

async function loadHostPort() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const host = typeof parsed.host === 'string' && parsed.host.trim() ? parsed.host.trim() : '127.0.0.1';
    const port = Number(parsed.port ?? 3001);
    return { host, port };
  } catch {
    return { host: '127.0.0.1', port: 3001 };
  }
}

function isPortFree(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function isLauncherResponsive(host, port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const url = `http://${host}:${port}/metadata/search?q=ps2`;
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function isLauncherCorsCompatible(host, port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  const testOrigin = 'https://gamehub-probe.vercel.app';

  try {
    const response = await fetch(`http://${host}:${port}/play`, {
      method: 'OPTIONS',
      signal: controller.signal,
      headers: {
        Origin: testOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
        'Access-Control-Request-Private-Network': 'true',
      },
    });

    if (response.status !== 204) return false;

    const allowOrigin = response.headers.get('access-control-allow-origin') || '';
    const allowPna = (response.headers.get('access-control-allow-private-network') || '').toLowerCase() === 'true';
    return allowOrigin === testOrigin && allowPna;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getListeningPidOnPort(port) {
  const command = `netstat -ano -p tcp | findstr /R /C:\":${port} .*LISTENING\"`;
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', command], {
    windowsHide: true,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (!result.stdout) return 0;

  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const columns = line.split(/\s+/);
    const pid = Number(columns[columns.length - 1] ?? 0);
    if (Number.isInteger(pid) && pid > 0) return pid;
  }

  return 0;
}

function killProcess(pid) {
  if (!pid) return false;

  const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/F'], {
    windowsHide: true,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return result.status === 0;
}

function startLauncherProcess() {
  const child = spawn(process.execPath, ['launcher/index.js'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  child.once('close', (code) => {
    process.exit(code ?? 0);
  });

  child.once('error', (error) => {
    console.error(`Falha ao iniciar launcher: ${error.message}`);
    process.exit(1);
  });
}

async function main() {
  const { host, port } = await loadHostPort();
  const free = await isPortFree(host, port);

  if (!free) {
    const responsive = await isLauncherResponsive(host, port);
    if (responsive) {
      const compatible = await isLauncherCorsCompatible(host, port);
      if (compatible) {
        console.log(`Launcher ja esta em execucao em http://${host}:${port}.`);
        process.exit(0);
        return;
      }

      const pid = getListeningPidOnPort(port);
      if (!pid) {
        console.error(`Launcher em ${host}:${port} parece desatualizado e nao foi possivel identificar PID para reiniciar.`);
        process.exit(1);
        return;
      }

      console.warn(`Launcher em ${host}:${port} parece desatualizado. Reiniciando processo PID ${pid}...`);
      const killed = killProcess(pid);
      if (!killed) {
        console.error(`Falha ao finalizar PID ${pid}. Feche o launcher manualmente e tente novamente.`);
        process.exit(1);
        return;
      }

      const becameFree = await isPortFree(host, port);
      if (!becameFree) {
        console.error(`Porta ${host}:${port} continua ocupada apos reinicio. Tente novamente.`);
        process.exit(1);
        return;
      }

      console.log(`Launcher antigo finalizado. Iniciando versao atual em http://${host}:${port}...`);
      startLauncherProcess();
      return;
    }

    console.error(`Porta ${host}:${port} ocupada por outro processo que nao parece ser o launcher.`);
    process.exit(1);
    return;
  }

  console.log(`Iniciando launcher em http://${host}:${port}...`);
  startLauncherProcess();
}

main().catch((error) => {
  console.error(`Erro ao executar launcher:start seguro: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
