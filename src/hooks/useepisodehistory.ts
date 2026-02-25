// src/hooks/useEpisodeHistory.ts
import { useLocalStorage } from "./uselocalstorage";

export interface HistoryEntry {
  animeId: string;
  animeTitle: string;
  animeCover: string;
  epId: string;
  epTitle: string;
  epNumber: number;
  audio: string;
  watchedAt: number;
}

const MAX_HISTORY = 50;

export function useEpisodeHistory() {
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("episode-history-v1", []);

  const addToHistory = (entry: HistoryEntry) => {
    setHistory(prev => {
      // Remove duplicata do mesmo ep
      const filtered = prev.filter(e => !(e.animeId === entry.animeId && e.epId === entry.epId));
      // Adiciona no início e limita
      return [entry, ...filtered].slice(0, MAX_HISTORY);
    });
  };

  const removeFromHistory = (animeId: string, epId: string) => {
    setHistory(prev => prev.filter(e => !(e.animeId === animeId && e.epId === epId)));
  };

  const clearHistory = () => setHistory([]);

  const getLastWatched = (animeId: string): HistoryEntry | null => {
    return history.find(e => e.animeId === animeId) ?? null;
  };

  return { history, addToHistory, removeFromHistory, clearHistory, getLastWatched };
}
