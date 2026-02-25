// src/hooks/useWatchlist.ts — versão localStorage
import { useCallback } from "react";
import { useLocalStorage } from "./uselocalstorage";

export type WatchStatus = "assistindo" | "concluido" | "droppado" | "quero-ver";

export interface WatchlistEntry {
  status: WatchStatus;
  addedAt: number;
  progress?: number;
}

export const WATCHLIST_LABELS: Record<WatchStatus, string> = {
  assistindo:  "📺 Assistindo",
  concluido:   "✅ Concluído",
  droppado:    "❌ Droppado",
  "quero-ver": "🔖 Quero Ver",
};

export const WATCHLIST_COLORS: Record<WatchStatus, string> = {
  assistindo:  "bg-blue-500/40 text-blue-300 border-blue-500/30",
  concluido:   "bg-green-500/40 text-green-300 border-green-500/30",
  droppado:    "bg-red-500/40 text-red-300 border-red-500/30",
  "quero-ver": "bg-yellow-500/40 text-yellow-300 border-yellow-500/30",
};

type WatchlistMap = Record<string, WatchlistEntry>;

export function useWatchlist() {
  const [list, setList] = useLocalStorage<WatchlistMap>("animeverse_watchlist", {});

  const setStatus = useCallback((animeId: string, status: WatchStatus | null) => {
    if (status === null) {
      // Remove
      setList(p => { const n = { ...p }; delete n[animeId]; return n; });
    } else {
      const entry: WatchlistEntry = {
        status,
        addedAt: list[animeId]?.addedAt ?? Date.now(),
        progress: list[animeId]?.progress ?? 0,
      };
      setList(p => ({ ...p, [animeId]: entry }));
    }
  }, [list, setList]);

  const setProgress = useCallback((animeId: string, ep: number) => {
    if (!list[animeId]) return;
    setList(p => ({ ...p, [animeId]: { ...p[animeId], progress: ep } }));
  }, [list, setList]);

  const getStatus   = (animeId: string): WatchStatus | null => list[animeId]?.status ?? null;
  const getEntry    = (animeId: string): WatchlistEntry | null => list[animeId] ?? null;
  const getByStatus = (status: WatchStatus) =>
    Object.entries(list).filter(([, e]) => e.status === status).map(([id]) => id);
  const totalCount  = Object.keys(list).length;

  return { list, setStatus, getStatus, getEntry, getByStatus, totalCount, setProgress, loaded: true };
}

// ── Episode watch tracking (mantido em localStorage) ──────

export function useWatched() {
  const [watched, setWatched] = useLocalStorage<Record<string, string[]>>("watched-eps", {});
  const markEpisode   = (animeId: string, epId: string) =>
    setWatched(p => { const eps = p[animeId] || []; return eps.includes(epId) ? p : { ...p, [animeId]: [...eps, epId] }; });
  const unmarkEpisode = (animeId: string, epId: string) =>
    setWatched(p => ({ ...p, [animeId]: (p[animeId] || []).filter(x => x !== epId) }));
  const isWatched     = (animeId: string, epId: string) => (watched[animeId] || []).includes(epId);
  const getWatchedCount = (animeId: string) => (watched[animeId] || []).length;
  return { markEpisode, unmarkEpisode, isWatched, getWatchedCount, watched };
}
