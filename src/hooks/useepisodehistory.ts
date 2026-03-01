// src/hooks/useEpisodeHistory.ts — versão DB
// Persiste o histórico de episódios em /api/user/:userId/history
// Interface pública idêntica à versão localStorage.

import { useCallback } from "react";
import { useUserData } from "./useuserdata";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  animeId:    string;
  animeTitle: string;
  animeCover: string;
  epId:       string;
  epTitle:    string;
  epNumber:   number;
  audio:      string;
  watchedAt:  number; // timestamp ms
}

const MAX_HISTORY = 50;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEpisodeHistory() {
  const {
    data: history,
    setData: setHistory,
    loading,
    syncing,
    error,
  } = useUserData<HistoryEntry[]>("history", []);

  /** Adiciona ou move uma entrada para o topo do histórico */
  const addToHistory = useCallback(
    (entry: HistoryEntry) => {
      setHistory(prev => {
        // Remove entrada duplicada (mesmo animeId + epId)
        const filtered = prev.filter(
          e => !(e.animeId === entry.animeId && e.epId === entry.epId),
        );
        // Insere no topo, limita ao MAX
        return [entry, ...filtered].slice(0, MAX_HISTORY);
      });
    },
    [setHistory],
  );

  /** Remove uma entrada específica */
  const removeFromHistory = useCallback(
    (animeId: string, epId: string) => {
      setHistory(prev =>
        prev.filter(e => !(e.animeId === animeId && e.epId === epId)),
      );
    },
    [setHistory],
  );

  /** Limpa todo o histórico */
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  /** Retorna o episódio mais recente de um anime (ou null) */
  const getLastWatched = (animeId: string): HistoryEntry | null =>
    history.find(e => e.animeId === animeId) ?? null;

  /** Retorna todos os episódios de um anime no histórico */
  const getAnimeHistory = (animeId: string): HistoryEntry[] =>
    history.filter(e => e.animeId === animeId);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
    getLastWatched,
    getAnimeHistory,
    loading,
    syncing,
    error,
  };
}