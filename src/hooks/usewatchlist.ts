// src/hooks/useWatchlist.ts — versão Supabase
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getUserId } from "./useuserid";

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

// Cache local para evitar re-fetches desnecessários
type WatchlistMap = Record<string, WatchlistEntry>;

export function useWatchlist() {
  const userId = getUserId();
  const [list, setList] = useState<WatchlistMap>({});
  const [loaded, setLoaded] = useState(false);

  // Carrega a watchlist do Supabase na montagem
  useEffect(() => {
    supabase
      .from("watchlist")
      .select("anime_id, status, progress, added_at")
      .eq("user_id", userId)
      .then(({ data, error }) => {
        if (error) { console.error("[watchlist] load:", error); return; }
        const map: WatchlistMap = {};
        (data ?? []).forEach((row: any) => {
          map[row.anime_id] = {
            status: row.status,
            addedAt: new Date(row.added_at).getTime(),
            progress: row.progress ?? 0,
          };
        });
        setList(map);
        setLoaded(true);
      });
  }, [userId]);

  const setStatus = useCallback(async (animeId: string, status: WatchStatus | null) => {
    if (status === null) {
      // Remove
      setList(p => { const n = { ...p }; delete n[animeId]; return n; });
      await supabase.from("watchlist").delete().eq("user_id", userId).eq("anime_id", animeId);
    } else {
      const entry: WatchlistEntry = {
        status,
        addedAt: list[animeId]?.addedAt ?? Date.now(),
        progress: list[animeId]?.progress ?? 0,
      };
      setList(p => ({ ...p, [animeId]: entry }));
      await supabase.from("watchlist").upsert(
        { user_id: userId, anime_id: animeId, status, progress: entry.progress },
        { onConflict: "user_id,anime_id" }
      );
    }
  }, [userId, list]);

  const setProgress = useCallback(async (animeId: string, ep: number) => {
    if (!list[animeId]) return;
    setList(p => ({ ...p, [animeId]: { ...p[animeId], progress: ep } }));
    await supabase
      .from("watchlist")
      .update({ progress: ep })
      .eq("user_id", userId)
      .eq("anime_id", animeId);
  }, [userId, list]);

  const getStatus   = (animeId: string): WatchStatus | null => list[animeId]?.status ?? null;
  const getEntry    = (animeId: string): WatchlistEntry | null => list[animeId] ?? null;
  const getByStatus = (status: WatchStatus) =>
    Object.entries(list).filter(([, e]) => e.status === status).map(([id]) => id);
  const totalCount  = Object.keys(list).length;

  return { list, setStatus, getStatus, getEntry, getByStatus, totalCount, setProgress, loaded };
}

// ── Episode watch tracking (mantido em localStorage por ser só booleano) ──────
import { useLocalStorage } from "./uselocalstorage";

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