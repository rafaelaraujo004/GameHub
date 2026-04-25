import { useState, useEffect, useRef, useCallback } from 'react';
import { addGame, checkDuplicateName } from '../services/games';
import { useAuthStore, useGamesStore, useToastStore } from '../store';
import { isAbsoluteWindowsPath, isValidUrl } from '../utils';
import { getFirebaseErrorMessage } from '../utils/firebaseError';
import { pickLocalGamePath, searchGameMetadata, type MetadataSuggestion } from '../services/launcher';
import type { GameFormData } from '../types';

interface AddGameModalProps {
  onClose: () => void;
}

const PLATFORMS = ['PS2'];

const initialForm: GameFormData = {
  name: '',
  platform: 'PS2',
  link: '',
  coverUrl: '',
  metadataCoverUrl: '',
  metadataId: '',
  description: '',
};

export function AddGameModal({ onClose }: AddGameModalProps) {
  const user = useAuthStore((s) => s.user);
  const addGameOptimistic = useGamesStore((s) => s.addGameOptimistic);
  const addToast = useToastStore((s) => s.addToast);

  const [form, setForm] = useState<GameFormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof GameFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [browsingLocalFile, setBrowsingLocalFile] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState('');
  const [metadataResults, setMetadataResults] = useState<MetadataSuggestion[]>([]);
  const [lastAutoAppliedMetadataId, setLastAutoAppliedMetadataId] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Fechar com Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const pickBestMetadataMatch = useCallback((query: string, results: MetadataSuggestion[]): MetadataSuggestion | null => {
    if (results.length === 0) return null;

    const normalize = (value: string) =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const normalizedQuery = normalize(query);
    const exact = results.find((item) => normalize(item.name) === normalizedQuery);
    if (exact) return exact;

    const startsWith = results.find((item) => normalize(item.name).startsWith(normalizedQuery));
    if (startsWith) return startsWith;

    return results[0] ?? null;
  }, []);

  const applyMetadata = useCallback((metadata: MetadataSuggestion, options?: { preserveName?: boolean; silent?: boolean }) => {
    setForm((prev) => ({
      ...prev,
      name: options?.preserveName ? prev.name : (metadata.name || prev.name),
      platform: 'PS2',
      metadataId: metadata.id,
      metadataCoverUrl: metadata.coverUrl || prev.metadataCoverUrl,
      description: metadata.description || prev.description,
      coverUrl: prev.coverUrl || metadata.coverUrl || '',
    }));

    if (!options?.silent) {
      addToast('Metadados aplicados.', 'success');
    }
  }, [addToast]);

  const fetchMetadata = useCallback(async (name: string) => {
    const query = name.trim();
    if (query.length < 2) {
      setMetadataResults([]);
      setMetadataError('');
      setLastAutoAppliedMetadataId('');
      return;
    }

    setMetadataLoading(true);
    setMetadataError('');
    try {
      const results = await searchGameMetadata(query);
      setMetadataResults(results);

      const bestMatch = pickBestMetadataMatch(query, results);
      if (bestMatch && bestMatch.id !== lastAutoAppliedMetadataId) {
        applyMetadata(bestMatch, { preserveName: true, silent: true });
        setLastAutoAppliedMetadataId(bestMatch.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Launcher offline → ignora silenciosamente (não mostra erro ao usuário)
      const isOffline =
        message.includes('ERR_CONNECTION_REFUSED') ||
        message.includes('Failed to fetch') ||
        message.includes('demorou para responder') ||
        message.includes('NetworkError');
      if (!isOffline) {
        setMetadataError(message || 'Falha ao buscar metadados.');
      }
      setMetadataResults([]);
      setLastAutoAppliedMetadataId('');
    } finally {
      setMetadataLoading(false);
    }
  }, [applyMetadata, lastAutoAppliedMetadataId, pickBestMetadataMatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchMetadata(form.name);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [form.name, fetchMetadata]);

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof GameFormData, string>> = {};
    if (!form.name.trim()) newErrors.name = 'Nome é obrigatório.';
    if (!form.link.trim()) {
      newErrors.link = 'Link ou caminho local é obrigatório.';
    } else {
      const value = form.link.trim();
      const isWeb = isValidUrl(value);
      const isLocal = isAbsoluteWindowsPath(value);
      if (!isWeb && !isLocal) {
        newErrors.link = 'Use URL (http/https) ou caminho absoluto no Windows.';
      }
    }
    if (form.coverUrl.trim() && !isValidUrl(form.coverUrl.trim())) {
      newErrors.coverUrl = 'URL da capa inválida.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!user || submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const isDuplicate = await checkDuplicateName(user.uid, form.name);
      if (isDuplicate) {
        setErrors((prev) => ({ ...prev, name: 'Você já tem um jogo com esse nome.' }));
        setSubmitting(false);
        return;
      }

      const newGame = await addGame(user.uid, form);
      addGameOptimistic(newGame);
      addToast(`"${newGame.name}" adicionado!`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      addToast(getFirebaseErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }, [user, submitting, validate, form, addGameOptimistic, addToast, onClose]);

  const handleContainerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;

    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();

    // Bloqueia comportamento nativo de Enter em inputs/selects para evitar qualquer submit implícito.
    if (tagName === 'input' || tagName === 'select') {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleChange = (field: keyof GameFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      void fetchMetadata(form.name);
    }
  };

  const handleApplyMetadataManually = (metadata: MetadataSuggestion) => {
    applyMetadata(metadata, { preserveName: false, silent: false });
    setLastAutoAppliedMetadataId(metadata.id);
    setMetadataResults([]);
    setMetadataError('');
  };

  const handleBrowseLocalFile = useCallback(async () => {
    if (browsingLocalFile || submitting) return;

    setBrowsingLocalFile(true);
    try {
      const selectedPath = await pickLocalGamePath();
      if (!selectedPath) return;

      setForm((prev) => ({ ...prev, link: selectedPath }));
      setErrors((prev) => ({ ...prev, link: undefined }));
      addToast('Arquivo local selecionado.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao abrir explorador de arquivos.';
      addToast(message, 'error');
    } finally {
      setBrowsingLocalFile(false);
    }
  }, [browsingLocalFile, submitting, addToast]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-[#111827] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md
        animate-[fadeInUp_0.2s_ease-out]">

        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Adicionar Jogo</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center
              text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div
          role="form"
          onKeyDown={handleContainerKeyDown}
          className="p-6 space-y-4">
          {/* Name + metadata */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Nome do Jogo *
            </label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              onKeyDown={handleNameKeyDown}
              placeholder="Ex: God of War II"
              className={`w-full bg-[#0f172a] border rounded-xl px-4 py-2.5 text-sm text-white
                placeholder:text-gray-600 outline-none transition-colors
                ${errors.name
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'border-white/10 focus:border-[#00ff88]/50'
                }`}
            />
            {errors.name && (
              <p className="text-red-400 text-xs mt-1">{errors.name}</p>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-gray-500">
                Busca inteligente de metadados de jogos PS2 (IGDB/RAWG) ao digitar o nome.
              </p>
              <button
                type="button"
                onClick={() => void fetchMetadata(form.name)}
                className="text-[11px] px-2 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
              >
                Buscar agora
              </button>
            </div>

            {metadataLoading && (
              <p className="text-[11px] text-[#00ff88] mt-2">Buscando metadados...</p>
            )}

            {metadataError && (
              <p className="text-[11px] text-red-400 mt-2">{metadataError}</p>
            )}

            {!metadataLoading && metadataResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-[#0b1220]">
                {metadataResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleApplyMetadataManually(item)}
                    className="w-full text-left px-3 py-2 border-b border-white/5 last:border-b-0 hover:bg-white/5 transition-colors"
                  >
                    <p className="text-xs text-white font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{item.platform || 'Plataforma desconhecida'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Platform */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Plataforma
            </label>
            <select
              value={form.platform}
              disabled
              onChange={(e) => handleChange('platform', e.target.value)}
              className="w-full bg-[#0f172a] border border-white/10 rounded-xl px-4 py-2.5 text-sm
                text-white outline-none focus:border-[#00ff88]/50 transition-colors"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Link */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Link do Jogo ou Caminho Local *
            </label>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => void handleBrowseLocalFile()}
                disabled={browsingLocalFile || submitting}
                className="text-[11px] px-2.5 py-1 rounded border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {browsingLocalFile ? 'Abrindo pastas...' : 'Procurar no PC'}
              </button>
            </div>
            <input
              type="text"
              value={form.link}
              onChange={(e) => handleChange('link', e.target.value)}
              placeholder="https://... ou C:\\Games\\gow2.iso"
              className={`w-full bg-[#0f172a] border rounded-xl px-4 py-2.5 text-sm text-white
                placeholder:text-gray-600 outline-none transition-colors
                ${errors.link
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'border-white/10 focus:border-[#00ff88]/50'
                }`}
            />
            {errors.link && (
              <p className="text-red-400 text-xs mt-1">{errors.link}</p>
            )}
          </div>

          {/* Cover URL */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              URL da Capa <span className="text-gray-600">(opcional)</span>
            </label>
            <input
              type="url"
              value={form.coverUrl}
              onChange={(e) => handleChange('coverUrl', e.target.value)}
              placeholder="https://..."
              className={`w-full bg-[#0f172a] border rounded-xl px-4 py-2.5 text-sm text-white
                placeholder:text-gray-600 outline-none transition-colors
                ${errors.coverUrl
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'border-white/10 focus:border-[#00ff88]/50'
                }`}
            />
            {errors.coverUrl && (
              <p className="text-red-400 text-xs mt-1">{errors.coverUrl}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-gray-400
                hover:bg-white/5 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-[#00ff88] text-black text-sm font-bold
                hover:bg-[#00e67a] active:scale-95 transition-all duration-150 disabled:opacity-60
                disabled:cursor-not-allowed"
            >
              {submitting ? 'Adicionando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
