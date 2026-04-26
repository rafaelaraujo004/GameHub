import { memo, useState, useCallback, Suspense, lazy } from 'react';
import { useGames } from '../hooks/useGames';
import { useGamesStore } from '../store';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { GameCard } from '../components/GameCard';
import { EmptyState } from '../components/EmptyState';
import { LibrarySkeleton } from '../components/Skeleton';
import { useCatalogInsights, type CatalogGame } from '../hooks/useCatalogInsights';

const AddGameModal = lazy(() =>
  import('../components/AddGameModal').then((m) => ({ default: m.AddGameModal }))
);

const PCSX2Settings = lazy(() =>
  import('../components/PCSX2Settings').then((m) => ({ default: m.PCSX2Settings }))
);

const LibraryStats = memo(function LibraryStats({ count }: { count: number }) {
  return (
    <p className="text-xs text-gray-500 mt-0.5">
      {count} {count === 1 ? 'jogo PS2' : 'jogos PS2'}
    </p>
  );
});

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const GameDetailsModal = memo(function GameDetailsModal({
  game,
  onClose,
}: {
  game: CatalogGame;
  onClose: () => void;
}) {
  const cover = game.coverUrl || game.metadataCoverUrl || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0e1626] shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] max-h-[85vh]">
          <div className="bg-[#111827]">
            {cover ? (
              <img src={cover} alt={game.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full min-h-80 items-center justify-center text-6xl">🎮</div>
            )}
          </div>

          <div className="p-6 overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-2xl font-black text-white leading-tight">{game.name}</h3>
                <p className="text-sm text-gray-400 mt-1">ID de metadado: {game.metadataId || 'N/A'}</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white"
                aria-label="Fechar detalhes"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5 text-xs">
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Plataforma</p>
                <p className="text-white font-semibold">{game.platform}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Tipo de link</p>
                <p className="text-white font-semibold uppercase">{game.linkType}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Favorito</p>
                <p className="text-white font-semibold">{game.favorite ? 'Sim' : 'Nao'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Sua nota</p>
                <p className="text-white font-semibold">{game.userRating > 0 ? `${game.userRating}/5` : 'Nao avaliado'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Media</p>
                <p className="text-white font-semibold">{game.averageRating > 0 ? game.averageRating.toFixed(1) : 'N/A'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Ranking</p>
                <p className="text-white font-semibold">{(game.recommendationScore * 100).toFixed(0)} pts</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Visualizacoes</p>
                <p className="text-white font-semibold">{game.views}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Jogadas</p>
                <p className="text-white font-semibold">{game.plays}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-gray-400">Adicionado em</p>
                <p className="text-white font-semibold">{formatDate(game.createdAt)}</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#111827] p-4">
              <p className="text-xs uppercase tracking-wide text-[#00ff88] mb-2">Sinopse</p>
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                {game.description?.trim() || 'Sinopse ainda nao disponivel para este jogo.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const HeroBanner = memo(function HeroBanner({ game }: { game: CatalogGame | null }) {
  if (!game) return null;
  const cover = game.coverUrl || game.metadataCoverUrl || '';

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#111827] mb-8">
      {cover ? (
        <img
          src={cover}
          alt={game.name}
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
      ) : null}
      <div className="absolute inset-0 bg-linear-to-r from-black via-black/80 to-black/20" />
      <div className="relative p-6 sm:p-10 max-w-2xl space-y-3">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#00ff88]">Destaque para voce</p>
        <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight">{game.name}</h1>
        <p className="text-sm text-gray-200/90 line-clamp-3">
          {game.description?.trim() || 'Sem sinopse. Abra os metadados para completar os detalhes.'}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-300">
          <span className="px-2 py-1 rounded bg-white/10">PS2</span>
          <span>Media: {game.averageRating > 0 ? game.averageRating.toFixed(1) : 'N/A'}</span>
          <span>{game.favorite ? 'Nos favoritos' : 'Recomendado pelo algoritmo'}</span>
        </div>
      </div>
    </section>
  );
});

const Rail = memo(function Rail({
  title,
  games,
  onOpenDetails,
  onToggleFavorite,
  onRate,
  onTrackPlay,
  onTrackView,
}: {
  title: string;
  games: CatalogGame[];
  onOpenDetails: (gameId: string) => void;
  onToggleFavorite: (gameId: string, favorite: boolean) => void | Promise<void>;
  onRate: (gameId: string, score: number) => void | Promise<void>;
  onTrackPlay: (gameId: string) => void | Promise<void>;
  onTrackView: (gameId: string) => void | Promise<void>;
}) {
  if (games.length === 0) return null;

  const railItems = games.slice(0, 12);
  return (
    <section className="mb-7">
      <h3 className="text-lg font-bold text-white mb-3">{title}</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
        {railItems.map((game) => (
          <div key={game.id} className="min-w-52 max-w-52 shrink-0 snap-start">
            <GameCard
              game={game}
              favorite={game.favorite}
              userRating={game.userRating}
              averageRating={game.averageRating}
              onOpenDetails={onOpenDetails}
              onToggleFavorite={onToggleFavorite}
              onRate={onRate}
              onTrackPlay={onTrackPlay}
              onTrackView={onTrackView}
            />
          </div>
        ))}
      </div>
    </section>
  );
});

const CatalogHome = memo(function CatalogHome({
  onAddGame,
  onOpenDetails,
  catalog,
}: {
  onAddGame: () => void;
  onOpenDetails: (gameId: string) => void;
  catalog: ReturnType<typeof useCatalogInsights>;
}) {
  const hasSearch = useGamesStore((s) => !!s.searchQuery.trim());
  const {
    hero,
    all,
    recommended,
    favorites,
    topRated,
    trending,
    newlyAdded,
    setGameFavorite,
    setGameRating,
    trackPlay,
    trackView,
  } = catalog;

  if (all.length === 0) {
    return <EmptyState hasSearch={hasSearch} onAddGame={onAddGame} />;
  }

  return (
    <>
      <HeroBanner game={hero} />
      <Rail
        title="Recomendados para voce"
        games={recommended}
        onOpenDetails={onOpenDetails}
        onToggleFavorite={setGameFavorite}
        onRate={setGameRating}
        onTrackPlay={trackPlay}
        onTrackView={trackView}
      />
      <Rail
        title="Seus favoritos"
        games={favorites}
        onOpenDetails={onOpenDetails}
        onToggleFavorite={setGameFavorite}
        onRate={setGameRating}
        onTrackPlay={trackPlay}
        onTrackView={trackView}
      />
      <Rail
        title="Mais bem avaliados"
        games={topRated}
        onOpenDetails={onOpenDetails}
        onToggleFavorite={setGameFavorite}
        onRate={setGameRating}
        onTrackPlay={trackPlay}
        onTrackView={trackView}
      />
      <Rail
        title="Em alta na sua biblioteca"
        games={trending}
        onOpenDetails={onOpenDetails}
        onToggleFavorite={setGameFavorite}
        onRate={setGameRating}
        onTrackPlay={trackPlay}
        onTrackView={trackView}
      />
      <Rail
        title="Recem-adicionados"
        games={newlyAdded}
        onOpenDetails={onOpenDetails}
        onToggleFavorite={setGameFavorite}
        onRate={setGameRating}
        onTrackPlay={trackPlay}
        onTrackView={trackView}
      />
    </>
  );
});

export default function LibraryPage() {
  useGames();

  const gamesLoading = useGamesStore((s) => s.gamesLoading);
  const catalog = useCatalogInsights();
  const totalPs2 = catalog.all.length;
  const [showModal, setShowModal] = useState(false);
  const [showPCSX2Settings, setShowPCSX2Settings] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const handleOpenModal = useCallback(() => setShowModal(true), []);
  const handleCloseModal = useCallback(() => setShowModal(false), []);
  const handleOpenPCSX2Settings = useCallback(() => setShowPCSX2Settings(true), []);
  const handleClosePCSX2Settings = useCallback(() => setShowPCSX2Settings(false), []);
  const handleOpenDetails = useCallback((gameId: string) => {
    setSelectedGameId(gameId);
  }, []);
  const handleCloseDetails = useCallback(() => {
    setSelectedGameId(null);
  }, []);

  const selectedGame = selectedGameId
    ? catalog.all.find((game) => game.id === selectedGameId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white">Minha Biblioteca</h2>
              {!gamesLoading && <LibraryStats count={totalPs2} />}
            </div>
            <button
              onClick={handleOpenPCSX2Settings}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:text-[#00ff88] hover:border-[#00ff88]/40 hover:bg-[#00ff88]/10 transition-colors"
            >
              Configurar PCSX2
            </button>
          </div>
          <SearchBar onAddGame={handleOpenModal} />
        </div>

        {gamesLoading ? (
          <LibrarySkeleton />
        ) : (
          <CatalogHome onAddGame={handleOpenModal} onOpenDetails={handleOpenDetails} catalog={catalog} />
        )}
      </main>

      {showModal && (
        <Suspense fallback={null}>
          <AddGameModal onClose={handleCloseModal} />
        </Suspense>
      )}

      {showPCSX2Settings && (
        <Suspense fallback={null}>
          <PCSX2Settings onClose={handleClosePCSX2Settings} />
        </Suspense>
      )}

      {selectedGame && <GameDetailsModal game={selectedGame} onClose={handleCloseDetails} />}
    </div>
  );
}