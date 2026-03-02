import { useState, useEffect, useCallback } from "react";

export interface Anime {
  id: string;
  title: string;
  episodes: { id: string }[] | number; // array or count
  thumbnail?: string;
  seriesId?: string;
  season?: number;
}

export interface EpisodeNotification {
  animeId: string;
  title: string;
  thumbnail?: string;
  newEpisodes: number;
  totalEpisodes: number;
}

const STORAGE_KEY = "animeverse_episode_counts";

/**
 * Hook to track new episodes across animes.
 *
 * Usage:
 *   const { notifications, totalNew, markAsRead, markAllRead } = useEpisodeNotifications(animes);
 */
export function useEpisodeNotifications(animes: Anime[]) {
  const [notifications, setNotifications] = useState<EpisodeNotification[]>([]);

  const getEpisodeCount = (anime: Anime): number => {
    if (Array.isArray(anime.episodes)) return anime.episodes.length;
    if (typeof anime.episodes === "number") return anime.episodes;
    return 0;
  };

  const loadStoredCounts = (): Record<string, number> => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveStoredCounts = (counts: Record<string, number>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
    } catch {}
  };

  useEffect(() => {
    if (!animes || animes.length === 0) return;

    const stored = loadStoredCounts();
    const newNotifications: EpisodeNotification[] = [];
    const updatedCounts: Record<string, number> = { ...stored };

    for (const anime of animes) {
      const current = getEpisodeCount(anime);
      const previous = stored[anime.id];

      if (previous === undefined) {
        // First time seeing this anime — store count, no notification
        updatedCounts[anime.id] = current;
      } else if (current > previous) {
        // New episodes detected!
        newNotifications.push({
          animeId: anime.id,
          title: anime.title,
          thumbnail: anime.thumbnail,
          newEpisodes: current - previous,
          totalEpisodes: current,
        });
        // Don't update stored count yet — user needs to mark as read
      }
    }

    saveStoredCounts(updatedCounts);
    setNotifications(newNotifications);
  }, [animes]);

  /** Mark a single anime's notifications as read */
  const markAsRead = useCallback((animeId: string) => {
    const anime = animes.find((a) => a.id === animeId);
    if (!anime) return;

    const stored = loadStoredCounts();
    stored[animeId] = getEpisodeCount(anime);
    saveStoredCounts(stored);

    setNotifications((prev) => prev.filter((n) => n.animeId !== animeId));
  }, [animes]);

  /** Mark all notifications as read */
  const markAllRead = useCallback(() => {
    const stored = loadStoredCounts();
    for (const anime of animes) {
      stored[anime.id] = getEpisodeCount(anime);
    }
    saveStoredCounts(stored);
    setNotifications([]);
  }, [animes]);

  /** Force-initialize all animes as seen (useful on first app load to avoid false positives) */
  const initializeAll = useCallback(() => {
    const counts: Record<string, number> = {};
    for (const anime of animes) {
      counts[anime.id] = getEpisodeCount(anime);
    }
    saveStoredCounts(counts);
    setNotifications([]);
  }, [animes]);

  return {
    notifications,
    totalNew: notifications.reduce((sum, n) => sum + n.newEpisodes, 0),
    markAsRead,
    markAllRead,
    initializeAll,
  };
}
