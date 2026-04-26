import { useCallback, useEffect, useState } from 'react';
import { getPCSX2Path, openFileDialog, savePCSX2Path } from '../services/launcher';
import { useLauncherStore, useToastStore } from '../store';
import { logError } from '../utils/logger';

interface PCSX2SettingsProps {
  onClose: () => void;
}

function isLikelyExePath(value: string): boolean {
  const normalized = value.trim();
  return /^[a-zA-Z]:\\/.test(normalized) && normalized.toLowerCase().endsWith('.exe');
}

export function PCSX2Settings({ onClose }: PCSX2SettingsProps) {
  const addToast = useToastStore((s) => s.addToast);
  const pcsx2Path = useLauncherStore((s) => s.pcsx2Path);
  const setPCSX2Path = useLauncherStore((s) => s.setPCSX2Path);

  const [value, setValue] = useState('');
  const [loadingPath, setLoadingPath] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoadingPath(true);
      try {
        const saved = await getPCSX2Path();
        setPCSX2Path(saved);
        setValue(saved ?? '');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao ler configuracao do PCSX2.';
        logError('PCSX2Settings.loadCurrentPath', error);
        addToast(message, 'error');
      } finally {
        setLoadingPath(false);
      }
    };

    void run();
  }, [addToast, setPCSX2Path]);

  const handleBrowse = useCallback(async () => {
    try {
      const selected = await openFileDialog();
      if (!selected) return;
      setValue(selected);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao abrir seletor de arquivo.';
      logError('PCSX2Settings.handleBrowse', error);
      addToast(message, 'error');
    }
  }, [addToast]);

  const handleSave = useCallback(async () => {
    if (!value.trim()) {
      addToast('Selecione o executavel do PCSX2.', 'error');
      return;
    }

    setSaving(true);
    try {
      await savePCSX2Path(value.trim());
      setPCSX2Path(value.trim());
      addToast('Caminho do PCSX2 salvo com sucesso.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao salvar configuracao do PCSX2.';
      logError('PCSX2Settings.handleSave', error, { path: value.trim() });
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }, [value, addToast, setPCSX2Path]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try {
      if (!isLikelyExePath(value)) {
        addToast('Caminho invalido. Selecione um arquivo .exe em caminho absoluto.', 'error');
        return;
      }

      await savePCSX2Path(value.trim());
      setPCSX2Path(value.trim());
      addToast('Teste concluido. Executavel parece valido.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao validar executavel do PCSX2.';
      logError('PCSX2Settings.handleTest', error, { path: value.trim() });
      addToast(message, 'error');
    } finally {
      setTesting(false);
    }
  }, [value, addToast, setPCSX2Path]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-[#111827] shadow-2xl animate-[fadeInUp_0.2s_ease-out]">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">Configuracoes do PCSX2</h2>
            <p className="text-xs text-gray-400 mt-1">Defina o executavel usado para iniciar os jogos.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            aria-label="Fechar configuracoes"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-[#0f172a] p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Caminho atual</p>
            <p className="text-sm text-gray-200 break-all">
              {loadingPath ? 'Carregando...' : (pcsx2Path || 'Nao configurado')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Executavel do PCSX2</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="C:\\Program Files\\PCSX2\\pcsx2.exe"
                className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#00ff88]/50"
              />
              <button
                type="button"
                onClick={() => void handleBrowse()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-gray-200 hover:border-[#00ff88]/40 hover:text-[#00ff88] transition-colors"
              >
                Procurar...
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-60"
            >
              {testing ? 'Testando...' : 'Testar executavel'}
            </button>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || testing}
              className="px-4 py-2 rounded-lg text-sm font-semibold border border-[#00ff88]/30 bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
