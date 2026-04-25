import net from 'node:net';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
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
      console.log(`Launcher ja esta em execucao em http://${host}:${port}.`);
      process.exit(0);
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
