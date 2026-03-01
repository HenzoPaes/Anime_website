// src/hooks/useWatchlist.ts — versão DB
// Substitui localStorage por /api/user/:userId/watchlist e /api/user/:userId/watched
// Interface pública 100% compatível com a versão anterior (sem quebrar nenhum componente).

import { useCallback } from "react";
import { useUserData } from "./useuserdata";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type WatchStatus =
  | "assistindo"
  | "concluido"
  | "droppado"
  | "quero-ver"
  | "reassistindo";

export interface WatchlistEntry {
  status:    WatchStatus;
  addedAt:   number;
  progress?: number; // último ep assistido
}

type WatchlistMap = Record<string, WatchlistEntry>;
type WatchedMap   = Record<string, string[]>; // animeId → epId[]

// ── Constantes de UI (mantidas idênticas) ─────────────────────────────────────

export const WATCHLIST_LABELS: Record<WatchStatus, string> = {
  assistindo:    "📺 Assistindo",
  concluido:     "✅ Concluído",
  droppado:      "❌ Droppado",
  "quero-ver":   "🔖 Quero Ver",
  "reassistindo":"🔁 Reassistindo",
};

export const WATCHLIST_COLORS: Record<WatchStatus, string> = {
  assistindo:    "bg-blue-500/40 text-blue-300 border-blue-500/30",
  concluido:     "bg-green-500/40 text-green-300 border-green-500/30",
  droppado:      "bg-red-500/40 text-red-300 border-red-500/30",
  "quero-ver":   "bg-yellow-500/40 text-yellow-300 border-yellow-500/30",
  "reassistindo":"bg-purple-500/40 text-purple-300 border-purple-500/30",
};

// ── useWatchlist ──────────────────────────────────────────────────────────────

export function useWatchlist() {
  const {
    data: list,
    setData: setList,
    loading,
    syncing,
  } = useUserData<WatchlistMap>("watchlist", {});

  const setStatus = useCallback(
    (animeId: string, status: WatchStatus | null) => {
      setList(prev => {
        const next = { ...prev };
        if (status === null) {
          delete next[animeId];
        } else {
          next[animeId] = {
            status,
            addedAt:  prev[animeId]?.addedAt  ?? Date.now(),
            progress: prev[animeId]?.progress ?? 0,
          };
        }
        return next;
      });
    },
    [setList],
  );

  const setProgress = useCallback(
    (animeId: string, ep: number) => {
      setList(prev => {
        if (!prev[animeId]) return prev;
        return { ...prev, [animeId]: { ...prev[animeId], progress: ep } };
      });
    },
    [setList],
  );

  const getStatus = (animeId: string): WatchStatus | null =>
    list[animeId]?.status ?? null;

  const getEntry = (animeId: string): WatchlistEntry | null =>
    list[animeId] ?? null;

  const getByStatus = (status: WatchStatus): string[] =>
    Object.entries(list)
      .filter(([, e]) => e.status === status)
      .map(([id]) => id);

  const totalCount = Object.keys(list).length;

  return {
    list,
    setStatus,
    getStatus,
    getEntry,
    getByStatus,
    totalCount,
    setProgress,
    loading,
    syncing,
    loaded: !loading, // compat com versão anterior
  };
}

// ── useWatched ────────────────────────────────────────────────────────────────
// Rastreia quais episódios individuais foram assistidos.

export function useWatched() {
  const {
    data: watched,
    setData: setWatched,
    loading,
    syncing,
  } = useUserData<WatchedMap>("watched", {});

  const markEpisode = useCallback(
    (animeId: string, epId: string) => {
      setWatched(prev => {
        const eps = prev[animeId] ?? [];
        if (eps.includes(epId)) return prev;
        return { ...prev, [animeId]: [...eps, epId] };
      });
    },
    [setWatched],
  );

  const unmarkEpisode = useCallback(
    (animeId: string, epId: string) => {
      setWatched(prev => ({
        ...prev,
        [animeId]: (prev[animeId] ?? []).filter(x => x !== epId),
      }));
    },
    [setWatched],
  );

  const isWatched = (animeId: string, epId: string): boolean =>
    (watched[animeId] ?? []).includes(epId);

  const getWatchedCount = (animeId: string): number =>
    (watched[animeId] ?? []).length;

  const getWatchedEpisodes = (animeId: string): string[] =>
    watched[animeId] ?? [];

  /** Último ep assistido por número (útil para "Continuar") */
  const getLastWatchedNumber = (animeId: string): number | null => {
    const eps = watched[animeId];
    if (!eps || eps.length === 0) return null;
    // ep IDs têm formato "ep-{number}" ou similar — tenta extrair número
    const nums = eps
      .map(id => parseInt(id.replace(/\D/g, ""), 10))
      .filter(n => !isNaN(n));
    return nums.length > 0 ? Math.max(...nums) : null;
  };

  return {
    watched,
    markEpisode,
    unmarkEpisode,
    isWatched,
    getWatchedCount,
    getWatchedEpisodes,
    getLastWatchedNumber,
    loading,
    syncing,
  };
}