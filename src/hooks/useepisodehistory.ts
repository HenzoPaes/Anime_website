// src/hooks/useEpisodeHistory.ts — versão localStorage
import { useCallback } from "react";
import { useLocalStorage } from "./uselocalstorage";

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
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("animeverse_history", []);

  const addToHistory = useCallback((entry: HistoryEntry) => {
    setHistory(prev => {
      const filtered = prev.filter(e => !(e.animeId === entry.animeId && e.epId === entry.epId));
      return [entry, ...filtered].slice(0, MAX_HISTORY);
    });
  }, [setHistory]);

  const removeFromHistory = useCallback((animeId: string, epId: string) => {
    setHistory(prev => prev.filter(e => !(e.animeId === animeId && e.epId === epId)));
  }, [setHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  const getLastWatched = (animeId: string): HistoryEntry | null =>
    history.find(e => e.animeId === animeId) ?? null;

  return { history, addToHistory, removeFromHistory, clearHistory, getLastWatched };
}
