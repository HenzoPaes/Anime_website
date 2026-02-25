// src/hooks/useEpisodeHistory.ts — versão Supabase
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { getUserId } from "./useuserid";

export interface HistoryEntry {
  animeId:    string;
  animeTitle: string;
  animeCover: string;
  epId:       string;
  epTitle:    string;
  epNumber:   number;
  audio:      string;
  watchedAt:  number;
}

const MAX_HISTORY = 50;

export function useEpisodeHistory() {
  const userId = getUserId();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    supabase
      .from("episode_history")
      .select("*")
      .eq("user_id", userId)
      .order("watched_at", { ascending: false })
      .limit(MAX_HISTORY)
      .then(({ data, error }) => {
        if (error) { console.error("[history] load:", error); return; }
        const entries: HistoryEntry[] = (data ?? []).map((row: any) => ({
          animeId:    row.anime_id,
          animeTitle: row.anime_title,
          animeCover: row.anime_cover ?? "",
          epId:       row.ep_id,
          epTitle:    row.ep_title,
          epNumber:   row.ep_number,
          audio:      row.audio,
          watchedAt:  new Date(row.watched_at).getTime(),
        }));
        setHistory(entries);
      });
  }, [userId]);

  const addToHistory = useCallback(async (entry: HistoryEntry) => {
    setHistory(prev => {
      const filtered = prev.filter(e => !(e.animeId === entry.animeId && e.epId === entry.epId));
      return [entry, ...filtered].slice(0, MAX_HISTORY);
    });
    await supabase.from("episode_history").upsert(
      {
        user_id:     userId,
        anime_id:    entry.animeId,
        anime_title: entry.animeTitle,
        anime_cover: entry.animeCover,
        ep_id:       entry.epId,
        ep_title:    entry.epTitle,
        ep_number:   entry.epNumber,
        audio:       entry.audio,
        watched_at:  new Date(entry.watchedAt).toISOString(),
      },
      { onConflict: "user_id,ep_id" }
    );
  }, [userId]);

  const removeFromHistory = useCallback(async (animeId: string, epId: string) => {
    setHistory(prev => prev.filter(e => !(e.animeId === animeId && e.epId === epId)));
    await supabase
      .from("episode_history")
      .delete()
      .eq("user_id", userId)
      .eq("ep_id", epId);
  }, [userId]);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await supabase.from("episode_history").delete().eq("user_id", userId);
  }, [userId]);

  const getLastWatched = (animeId: string): HistoryEntry | null =>
    history.find(e => e.animeId === animeId) ?? null;

  return { history, addToHistory, removeFromHistory, clearHistory, getLastWatched };
}