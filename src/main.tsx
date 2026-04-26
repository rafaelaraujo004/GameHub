import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

type MainIpcPayload = {
  gamePath?: string;
  gameSource?: 'local' | 'google_drive';
};

function getRuntimeRequire(): ((id: string) => any) | null {
  const maybeRequire = (globalThis as { require?: (id: string) => any }).require;
  return typeof maybeRequire === 'function' ? maybeRequire : null;
}

function registerElectronLauncherHandlers() {
  const runtimeRequire = getRuntimeRequire();
  if (!runtimeRequire) return;

  let electron: any;
  try {
    electron = runtimeRequire('electron');
  } catch {
    return;
  }

  const { ipcMain, dialog, app } = electron ?? {};
  if (!ipcMain || !dialog || !app || typeof ipcMain.handle !== 'function') return;

  const path = runtimeRequire('node:path');
  const fs = runtimeRequire('node:fs');
  const fsPromises = runtimeRequire('node:fs/promises');
  const { spawn } = runtimeRequire('node:child_process');

  let StoreCtor: any;
  try {
    StoreCtor = runtimeRequire('electron-store');
  } catch {
    StoreCtor = null;
  }

  const memoryFallback = new Map<string, string>();
  const store = StoreCtor ? new StoreCtor({ name: 'gamehub-settings' }) : null;

  const safeRemoveHandler = (channel: string) => {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // no-op
    }
  };

  const getTempDir = async () => {
    const tempDir = path.join(app.getPath('temp'), 'ps2launcher');
    await fsPromises.mkdir(tempDir, { recursive: true });
    return tempDir;
  };

  const scheduleTempCleanup = (filePath: string) => {
    const timer = setTimeout(async () => {
      try {
        await fsPromises.unlink(filePath);
      } catch {
        // no-op
      }
    }, 5 * 60 * 1000);
    const maybeTimer = timer as unknown as { unref?: () => void };
    if (typeof maybeTimer.unref === 'function') maybeTimer.unref();
  };

  const downloadToFile = async (url: string, outputPath: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    await fsPromises.writeFile(outputPath, new Uint8Array(arrayBuffer));
  };

  safeRemoveHandler('save-pcsx2-path');
  ipcMain.handle('save-pcsx2-path', async (_event: unknown, pcsx2Path: string) => {
    if (!pcsx2Path || typeof pcsx2Path !== 'string') {
      throw new Error('Caminho do PCSX2 invalido.');
    }
    if (store) {
      store.set('pcsx2Path', pcsx2Path);
    } else {
      memoryFallback.set('pcsx2Path', pcsx2Path);
    }
    return null;
  });

  safeRemoveHandler('get-pcsx2-path');
  ipcMain.handle('get-pcsx2-path', async () => {
    if (store) {
      const value = store.get('pcsx2Path');
      return typeof value === 'string' && value.trim() ? value : null;
    }
    return memoryFallback.get('pcsx2Path') ?? null;
  });

  safeRemoveHandler('open-file-dialog');
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Selecione o executavel do PCSX2',
      properties: ['openFile'],
      filters: [
        { name: 'Executavel PCSX2', extensions: ['exe'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });

  safeRemoveHandler('download-drive-file');
  ipcMain.handle('download-drive-file', async (_event: unknown, payload: { downloadUrl?: string; fileName?: string }) => {
    const downloadUrl = String(payload?.downloadUrl ?? '').trim();
    if (!downloadUrl) {
      return { success: false, error: 'URL do Google Drive invalida.' };
    }

    try {
      const tempDir = await getTempDir();
      const rawName = String(payload?.fileName ?? 'game.iso').trim() || 'game.iso';
      const safeName = rawName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
      const outputPath = path.join(tempDir, safeName);
      await downloadToFile(downloadUrl, outputPath);
      return { success: true, filePath: outputPath };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao baixar arquivo do Google Drive.',
      };
    }
  });

  safeRemoveHandler('launch-game');
  ipcMain.handle('launch-game', async (_event: unknown, payload: MainIpcPayload) => {
    try {
      const gamePath = String(payload?.gamePath ?? '').trim();
      if (!gamePath) {
        return { success: false, error: 'Caminho do jogo invalido.' };
      }

      const pcsx2Path = (store ? store.get('pcsx2Path') : memoryFallback.get('pcsx2Path')) as string | undefined;
      if (!pcsx2Path || !String(pcsx2Path).trim()) {
        return { success: false, error: 'PCSX2 nao configurado.' };
      }

      if (!fs.existsSync(pcsx2Path)) {
        return { success: false, error: 'Executavel do PCSX2 nao encontrado no caminho configurado.' };
      }

      const child = spawn(pcsx2Path, [gamePath, '--nogui', '--fullscreen', '--batch'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      if (payload?.gameSource === 'google_drive') {
        scheduleTempCleanup(gamePath);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao iniciar o jogo.',
      };
    }
  });
}

try {
  registerElectronLauncherHandlers();
} catch {
  // no-op
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
