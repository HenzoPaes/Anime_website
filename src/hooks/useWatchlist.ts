import { useLocalStorage } from "./useLocalStorage";

export type WatchStatus = "assistindo" | "concluido" | "droppado" | "quero-ver";

export interface WatchlistEntry {
  status: WatchStatus;
  addedAt: number;
  progress?: number; // last watched episode number
}

export const WATCHLIST_LABELS: Record<WatchStatus, string> = {
  assistindo:   "📺 Assistindo",
  concluido:    "✅ Concluído",
  droppado:     "❌ Droppado",
  "quero-ver":  "🔖 Quero Ver",
};

export const WATCHLIST_COLORS: Record<WatchStatus, string> = {
  assistindo:   "bg-blue-500/20 text-blue-300 border-blue-500/30",
  concluido:    "bg-green-500/20 text-green-300 border-green-500/30",
  droppado:     "bg-red-500/20 text-red-300 border-red-500/30",
  "quero-ver":  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

export function useWatchlist() {
  const [list, setList] = useLocalStorage<Record<string, WatchlistEntry>>("watchlist-v2", {});

  const setStatus = (animeId: string, status: WatchStatus | null) => {
    setList((p) => {
      const next = { ...p };
      if (status === null) { delete next[animeId]; return next; }
      next[animeId] = { status, addedAt: Date.now(), progress: p[animeId]?.progress };
      return next;
    });
  };

  const getStatus = (animeId: string): WatchStatus | null => list[animeId]?.status ?? null;
  const getEntry  = (animeId: string): WatchlistEntry | null => list[animeId] ?? null;
  const getByStatus = (status: WatchStatus) =>
    Object.entries(list).filter(([, e]) => e.status === status).map(([id]) => id);
  const totalCount = Object.keys(list).length;

  const setProgress = (animeId: string, ep: number) =>
    setList((p) => p[animeId] ? { ...p, [animeId]: { ...p[animeId], progress: ep } } : p);

  return { list, setStatus, getStatus, getEntry, getByStatus, totalCount, setProgress };
}

// ── Episode watch tracking (separate from watchlist) ─────────────────────────
export function useWatched() {
  const [watched, setWatched] = useLocalStorage<Record<string, string[]>>("watched-eps", {});
  const markEpisode   = (animeId: string, epId: string) =>
    setWatched((p) => { const eps = p[animeId] || []; return eps.includes(epId) ? p : { ...p, [animeId]: [...eps, epId] }; });
  const unmarkEpisode = (animeId: string, epId: string) =>
    setWatched((p) => ({ ...p, [animeId]: (p[animeId] || []).filter((x) => x !== epId) }));
  const isWatched     = (animeId: string, epId: string) => (watched[animeId] || []).includes(epId);
  const getWatchedCount = (animeId: string) => (watched[animeId] || []).length;
  return { markEpisode, unmarkEpisode, isWatched, getWatchedCount, watched };
}
