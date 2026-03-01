// src/hooks/useEpisodeNotifications.ts — versão DB
// Rastreia novos episódios sem precisar de inscrição explícita.
// Usa /api/user/:userId/ep-counts para persistir as contagens.
// Interface pública idêntica à versão localStorage.

import { useState, useEffect, useCallback } from "react";
import { useUserData } from "./useuserdata";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Anime {
  id:        string;
  title:     string;
  episodes:  { id: string }[] | number;
  thumbnail?: string;
}

export interface EpisodeNotification {
  animeId:       string;
  title:         string;
  thumbnail?:    string;
  newEpisodes:   number;
  totalEpisodes: number;
}

type CountsMap = Record<string, number>;

function getCount(anime: Anime): number {
  if (Array.isArray(anime.episodes)) return anime.episodes.length;
  if (typeof anime.episodes === "number") return anime.episodes;
  return 0;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEpisodeNotifications(animes: Anime[]) {
  const {
    data: savedCounts,
    setData: setSavedCounts,
    loading,
  } = useUserData<CountsMap>("ep-counts", {});

  const [notifications, setNotifications] = useState<EpisodeNotification[]>([]);

  // Detecta novos eps quando os dados do servidor chegarem
  useEffect(() => {
    if (loading || !animes.length) return;

    const newNotifications: EpisodeNotification[] = [];
    const updated: CountsMap = { ...savedCounts };
    let hasChanges = false;

    for (const anime of animes) {
      const current  = getCount(anime);
      const previous = savedCounts[anime.id];

      if (previous === undefined) {
        updated[anime.id] = current;
        hasChanges = true;
      } else if (current > previous) {
        newNotifications.push({
          animeId:       anime.id,
          title:         anime.title,
          thumbnail:     anime.thumbnail,
          newEpisodes:   current - previous,
          totalEpisodes: current,
        });
        // Não atualiza o count até markAsRead
      }
    }

    if (hasChanges) setSavedCounts(updated);
    if (newNotifications.length > 0) setNotifications(newNotifications);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, animes.length]);

  /** Marca um anime como lido (atualiza contagem salva) */
  const markAsRead = useCallback(
    (animeId: string) => {
      const anime = animes.find(a => a.id === animeId);
      if (!anime) return;
      setSavedCounts(prev => ({ ...prev, [animeId]: getCount(anime) }));
      setNotifications(prev => prev.filter(n => n.animeId !== animeId));
    },
    [animes, setSavedCounts],
  );

  /** Marca todos como lidos */
  const markAllRead = useCallback(() => {
    const updated: CountsMap = {};
    for (const anime of animes) {
      updated[anime.id] = getCount(anime);
    }
    setSavedCounts(prev => ({ ...prev, ...updated }));
    setNotifications([]);
  }, [animes, setSavedCounts]);

  /** Inicializa todos como vistos (evita falsos positivos no primeiro load) */
  const initializeAll = useCallback(() => {
    const counts: CountsMap = {};
    for (const anime of animes) {
      counts[anime.id] = getCount(anime);
    }
    setSavedCounts(counts);
    setNotifications([]);
  }, [animes, setSavedCounts]);

  return {
    notifications,
    totalNew:    notifications.reduce((s, n) => s + n.newEpisodes, 0),
    markAsRead,
    markAllRead,
    initializeAll,
    loading,
  };
}