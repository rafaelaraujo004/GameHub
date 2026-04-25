import { memo, useState, useCallback, useEffect } from 'react';
import type { Game } from '../types';
import { getLinkIcon, isAbsoluteWindowsPath } from '../utils';
import { deleteGame } from '../services/games';
import { startSmartLaunch, waitForLaunchCompletion, type LauncherJob } from '../services/launcher';
import { useGamesStore, useToastStore, useDownloadsStore } from '../store';

interface GameCardProps {
  game: Game;
  favorite?: boolean;
  userRating?: number;
  averageRating?: number;
  onOpenDetails?: (gameId: string) => void;
  onToggleFavorite?: (gameId: string, favorite: boolean) => void | Promise<void>;
  onRate?: (gameId: string, score: number) => void | Promise<void>;
  onTrackPlay?: (gameId: string) => void | Promise<void>;
  onTrackView?: (gameId: string) => void | Promise<void>;
}

const PLATFORM_COLORS: Record<string, string> = {
  'PS2': 'text-cyan-300 bg-cyan-400/10',
  'PC': 'text-blue-400 bg-blue-400/10',
  'PS5': 'text-indigo-400 bg-indigo-400/10',
  'PS4': 'text-indigo-400 bg-indigo-400/10',
  'Xbox': 'text-green-400 bg-green-400/10',
  'Nintendo Switch': 'text-red-400 bg-red-400/10',
  'Mobile': 'text-yellow-400 bg-yellow-400/10',
};

const PLATFORM_AGE_RATING: Record<string, string> = {
  'PS2': '16',
  'PS5': '16',
  'PS4': '16',
  'Xbox': '16',
  'PC': '14',
  'Nintendo Switch': '10',
  'Mobile': '10',
};

function getAgeRating(game: Game): string {
  const source = `${game.name} ${game.description ?? ''}`.toLowerCase();
  if (/horror|terror|mortal|blood|sangue|violencia|violência/.test(source)) return '18';
  return PLATFORM_AGE_RATING[game.platform] ?? '12';
}

/**
 * Comparador customizado para memo: evita re-renders quando o Firestore
 * retorna um novo snapshot com os mesmos dados (novos objetos, mesmos valores).
 * Só re-renderiza quando um campo que afeta a UI realmente muda.
 */
function arePropsEqual(prev: GameCardProps, next: GameCardProps): boolean {
  const p = prev.game;
  const n = next.game;
  return (
    p.id === n.id &&
    p.name === n.name &&
    p.platform === n.platform &&
    p.link === n.link &&
    p.linkType === n.linkType &&
    p.coverUrl === n.coverUrl &&
    p.metadataCoverUrl === n.metadataCoverUrl &&
    p.metadataId === n.metadataId &&
    prev.favorite === next.favorite &&
    prev.userRating === next.userRating &&
    prev.averageRating === next.averageRating
  );
}

export const GameCard = memo(function GameCard({
  game,
  favorite = false,
  userRating = 0,
  averageRating = 0,
  onOpenDetails,
  onToggleFavorite,
  onRate,
  onTrackPlay,
  onTrackView,
}: GameCardProps) {
  const [playing, setPlaying] = useState(false);
  const [launchState, setLaunchState] = useState<LauncherJob | null>(null);
  const [imgError, setImgError] = useState(false);
  const removeGameOptimistic = useGamesStore((s) => s.removeGameOptimistic);
  const addToast = useToastStore((s) => s.addToast);
  const addActiveJob = useDownloadsStore((s) => s.addActiveJob);
  const updateActiveJob = useDownloadsStore((s) => s.updateActiveJob);
  const finishActiveJob = useDownloadsStore((s) => s.finishActiveJob);

  const isDownloadMode = !isAbsoluteWindowsPath(game.link);

  useEffect(() => {
    void onTrackView?.(game.id);
  }, [game.id, onTrackView]);

  const handlePlay = useCallback(() => {
    const run = async () => {
      setPlaying(true);
      setLaunchState(null);
      let jobId: string | null = null;

      try {
        await onTrackPlay?.(game.id);

        jobId = await startSmartLaunch({
          name: game.name,
          link: game.link,
          metadataId: game.metadataId,
        });

        if (isDownloadMode) addActiveJob(jobId, game.name);

        const finalJob = await waitForLaunchCompletion(jobId, (job) => {
          setLaunchState(job);
          if (isDownloadMode) updateActiveJob(jobId!, job);
        });

        if (isDownloadMode) finishActiveJob(jobId, finalJob);

        if (finalJob.phase === 'error') {
          addToast(finalJob.error || finalJob.message || 'Falha ao iniciar jogo.', 'error');
          setLaunchState(finalJob);
        } else {
          addToast('Jogo iniciado.', 'success');
          setTimeout(() => setLaunchState(null), 3000);
        }
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : 'Launcher local indisponivel. Inicie o servico na porta 3001.';
        addToast(message, 'error');
        const errorJob: LauncherJob = { id: jobId ?? '', phase: 'error', progress: 0, speedMbps: 0, etaSeconds: null, message, error: message };
        if (jobId && isDownloadMode) finishActiveJob(jobId, errorJob);
        setLaunchState(errorJob);
      } finally {
        setPlaying(false);
      }
    };

    void run();
  }, [game.id, game.name, game.link, game.metadataId, isDownloadMode, addToast, addActiveJob, updateActiveJob, finishActiveJob, onTrackPlay]);

  const handleDelete = useCallback(async () => {
    removeGameOptimistic(game.id);
    try {
      await deleteGame(game.id);
      addToast(`"${game.name}" removido.`, 'success');
    } catch {
      addToast('Erro ao remover jogo.', 'error');
    }
  }, [game.id, game.name, removeGameOptimistic, addToast]);

  const platformColor = PLATFORM_COLORS[game.platform] ?? 'text-gray-400 bg-gray-400/10';
  const linkIcon = getLinkIcon(game.linkType);
  const synopsis = (game.description ?? '').trim();
  const ageRating = getAgeRating(game);
  const openDetails = useCallback(() => {
    onOpenDetails?.(game.id);
  }, [onOpenDetails, game.id]);

  return (
    <div
      className="group game-case relative cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetails();
        }
      }}>

      {/* Cover */}
      <div className="game-case-cover aspect-[10/14] relative overflow-hidden">
        {(game.coverUrl || game.metadataCoverUrl) && !imgError ? (
          <img
            src={game.coverUrl || game.metadataCoverUrl}
            loading="lazy"
            alt={game.name}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover object-center game-case-art"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center text-4xl select-none game-case-fallback">
            🎮
          </div>
        )}

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleDelete();
          }}
          aria-label="Remover jogo"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-red-400
            opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center
            justify-center hover:bg-red-500/20 text-xs"
        >
          ✕
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            void onToggleFavorite?.(game.id, !favorite);
          }}
          aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          className={`absolute top-2 left-2 w-8 h-8 rounded-full bg-black/70 transition-colors duration-150 flex items-center justify-center text-sm
            ${favorite ? 'text-rose-400' : 'text-gray-300 hover:text-rose-300'}`}
        >
          {favorite ? '❤' : '♡'}
        </button>

        {/* Platform badge */}
        <span className={`game-case-platform-badge text-xs px-2 py-0.5 rounded-full font-medium ${platformColor}`}>
          {game.platform}
        </span>

        <span className="game-case-rating-badge" title={`Classificacao ${ageRating}`}>
          {ageRating}
        </span>
      </div>

      {/* Info */}
      <div className="px-4 pt-[11px] pb-[14px]">
        <h3 className="font-semibold text-[15px] text-[#f3f4f6] truncate leading-[1.2] tracking-[0.01em] mb-1.5" title={game.name}>
          {game.name}
        </h3>
        <p className="text-[12px] text-gray-400/90 mb-2 flex items-center gap-1.5 leading-none">
          <span className="opacity-80">{linkIcon}</span>
          <span className="truncate">{game.linkType === 'drive' ? 'Google Drive' : game.linkType === 'mega' ? 'Mega' : game.linkType === 'local' ? 'Arquivo local' : 'Link externo'}</span>
        </p>

        <div className="mb-2">
          <p className="text-[11px] text-gray-400/95 leading-4 line-clamp-2 min-h-8">
            {synopsis || 'Sem sinopse. Use os metadados para preencher a descricao do jogo.'}
          </p>
        </div>

        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px] text-amber-300/95">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onRate?.(game.id, star);
                }}
                className="hover:scale-110 transition-transform"
                aria-label={`Avaliar com ${star} estrelas`}
              >
                {userRating >= star ? '★' : '☆'}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-400/95 tracking-[0.01em]">
            Media: {averageRating > 0 ? averageRating.toFixed(1) : 'N/A'}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlay();
          }}
          disabled={playing}
          className={`w-full py-[9px] rounded-[11px] text-sm font-semibold transition-all duration-150
            ${playing
              ? 'bg-[#00ff88]/30 text-[#00ff88] scale-95 cursor-default'
              : 'bg-[#00ff88]/10 text-[#00ff88] hover:bg-[#00ff88]/20 active:scale-95 border border-[#00ff88]/20 hover:border-[#00ff88]/50'
            }`}
        >
          {playing ? '▶ Preparando...' : '▶ Jogar'}
        </button>

        {launchState && (
          <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-gray-300 space-y-1">
            <p className={launchState.phase === 'error' ? 'text-red-400' : ''}>{launchState.message}</p>
            {launchState.phase === 'downloading' && (
              <>
                <div className="h-1.5 w-full rounded bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#00ff88] transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, launchState.progress))}%` }}
                  />
                </div>
                <p>Downloading: {launchState.progress.toFixed(1)}%</p>
                <p>Speed: {launchState.speedMbps.toFixed(2)} MB/s</p>
                <p>Time remaining: {launchState.etaSeconds !== null ? `~${launchState.etaSeconds}s` : 'calculating...'}</p>
              </>
            )}
            {launchState.phase === 'error' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlay();
                }}
                className="mt-1 w-full py-1 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20
                  text-[11px] font-semibold hover:bg-yellow-500/20 active:scale-95 transition-all"
              >
                ↩ Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, arePropsEqual);
