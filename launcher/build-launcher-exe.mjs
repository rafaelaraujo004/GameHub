import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(__dirname, 'release');
const outputExe = path.join(releaseDir, 'GameHubLauncher.exe');
const configSource = path.join(__dirname, 'config.json');
const configTarget = path.join(releaseDir, 'config.json');
const quickStartTarget = path.join(releaseDir, 'README-rapido.txt');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Falha ao executar ${command} ${args.join(' ')} (exit ${code ?? 'unknown'}).`));
    });
  });
}

async function main() {
  await mkdir(releaseDir, { recursive: true });

  const pkgCommand = 'npx pkg launcher/start-safe.js --targets node18-win-x64 --output launcher/release/GameHubLauncher.exe';

  if (process.platform === 'win32') {
    await runCommand('cmd.exe', ['/d', '/s', '/c', pkgCommand]);
  } else {
    await runCommand('sh', ['-lc', pkgCommand]);
  }

  await copyFile(configSource, configTarget);

  const quickStart = [
    'GameHub Launcher - Inicio Rapido',
    '',
    '1) Ajuste o caminho do PCSX2 em config.json (arquivo na mesma pasta deste .exe).',
    '2) Execute GameHubLauncher.exe.',
    '3) Abra seu link da Vercel e clique em Jogar.',
    '',
    'Observacao: deixe o launcher aberto durante o uso do site.',
  ].join('\r\n');

  await writeFile(quickStartTarget, quickStart, 'utf-8');

  console.log('Launcher standalone gerado com sucesso.');
  console.log(`Saida: ${outputExe}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
