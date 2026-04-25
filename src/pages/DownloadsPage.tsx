import { useDownloadsStore } from '../store';
import { Header } from '../components/Header';
import type { ActiveDownload, DownloadHistoryEntry } from '../store';

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function ActiveJobRow({ item }: { item: ActiveDownload }) {
  const { job, gameName } = item;
  const isDownloading = job.phase === 'downloading';

  return (
    <div className="rounded-xl border border-white/10 bg-[#111827] p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold text-sm text-white truncate max-w-[70%]">{gameName}</p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#00ff88]/10 text-[#00ff88] font-medium capitalize">
          {job.phase}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{job.message}</p>
      {isDownloading && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#00ff88] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>{job.progress.toFixed(1)}%</span>
            <span>{job.speedMbps.toFixed(2)} MB/s</span>
            <span>{job.etaSeconds !== null ? `~${job.etaSeconds}s restantes` : 'calculando...'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: DownloadHistoryEntry }) {
  const isError = entry.phase === 'error';
  const duration = formatDuration(entry.completedAt - entry.startedAt);

  return (
    <div className={`rounded-xl border p-4 ${isError ? 'border-red-500/20 bg-red-500/5' : 'border-white/10 bg-[#111827]'}`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm text-white truncate max-w-[70%]">{entry.gameName}</p>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isError ? 'bg-red-500/10 text-red-400' : 'bg-[#00ff88]/10 text-[#00ff88]'}`}>
          {isError ? 'Erro' : 'Concluído'}
        </span>
      </div>
      {isError && entry.error && (
        <p className="text-xs text-red-400/80 mt-1 truncate">{entry.error}</p>
      )}
      <p className="text-[11px] text-gray-600 mt-1">
        {new Date(entry.completedAt).toLocaleString('pt-BR')} · {duration}
      </p>
    </div>
  );
}

export default function DownloadsPage() {
  const active = useDownloadsStore((s) => s.active);
  const history = useDownloadsStore((s) => s.history);
  const clearHistory = useDownloadsStore((s) => s.clearHistory);

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Ativos */}
        <section>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            Downloads ativos
            {active.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#00ff88]/10 text-[#00ff88]">
                {active.length}
              </span>
            )}
          </h2>
          {active.length === 0 ? (
            <p className="text-sm text-gray-500 bg-[#111827] rounded-xl border border-white/5 p-6 text-center">
              Nenhum download em andamento.
            </p>
          ) : (
            <div className="space-y-3">
              {active.map((item) => (
                <ActiveJobRow key={item.jobId} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* Histórico */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Histórico</h2>
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5
                  rounded-lg hover:bg-red-400/10 border border-transparent hover:border-red-400/20"
              >
                Limpar
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500 bg-[#111827] rounded-xl border border-white/5 p-6 text-center">
              Nenhum download concluído ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <HistoryRow key={entry.jobId} entry={entry} />
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
