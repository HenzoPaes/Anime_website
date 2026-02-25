// src/hooks/useNotifications.ts
import { useState, useEffect, useCallback } from "react";
import { useLocalStorage } from "./uselocalstorage";

export interface EpisodeNotification {
  animeId: string;
  animeTitle: string;
  animeCover: string;
  newEpisodes: number;
  totalEpisodes: number;
  seenAt: number;
}

const COUNTS_KEY = "animeverse_ep_counts";
const SUBS_KEY   = "animeverse_subscriptions";

function loadCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(COUNTS_KEY) || "{}"); }
  catch { return {}; }
}
function saveCounts(c: Record<string, number>) {
  localStorage.setItem(COUNTS_KEY, JSON.stringify(c));
}

export function useNotifications(animes: Array<{ id: string; title: string; cover: string; episodeCount: number }>) {
  const [subscriptions, setSubscriptions] = useLocalStorage<string[]>(SUBS_KEY, []);
  const [notifications, setNotifications] = useState<EpisodeNotification[]>([]);

  // Check for new episodes on mount / when animes update
  useEffect(() => {
    if (!animes.length) return;
    const stored = loadCounts();
    const newNotifs: EpisodeNotification[] = [];
    const updated: Record<string, number> = { ...stored };

    for (const anime of animes) {
      const prev = stored[anime.id];
      const curr = anime.episodeCount;
      if (prev === undefined) {
        updated[anime.id] = curr;
        continue;
      }
      if (curr > prev && subscriptions.includes(anime.id)) {
        newNotifs.push({
          animeId: anime.id,
          animeTitle: anime.title,
          animeCover: anime.cover,
          newEpisodes: curr - prev,
          totalEpisodes: curr,
          seenAt: 0,
        });
      }
    }
    saveCounts(updated);
    if (newNotifs.length > 0) setNotifications(prev => [...newNotifs, ...prev]);
  }, [animes.length, subscriptions.join(",")]);

  const isSubscribed = useCallback((animeId: string) => subscriptions.includes(animeId), [subscriptions]);

  const toggleSubscription = useCallback((animeId: string) => {
    setSubscriptions(prev =>
      prev.includes(animeId) ? prev.filter(id => id !== animeId) : [...prev, animeId]
    );
  }, []);

  const dismissNotification = useCallback((animeId: string) => {
    // Mark as seen in counts
    const stored = loadCounts();
    const anime = animes.find(a => a.id === animeId);
    if (anime) { stored[animeId] = anime.episodeCount; saveCounts(stored); }
    setNotifications(prev => prev.filter(n => n.animeId !== animeId));
  }, [animes]);

  const dismissAll = useCallback(() => {
    const stored = loadCounts();
    for (const anime of animes) { stored[anime.id] = anime.episodeCount; }
    saveCounts(stored);
    setNotifications([]);
  }, [animes]);

  const totalNew = notifications.length;

  return { notifications, totalNew, isSubscribed, toggleSubscription, dismissNotification, dismissAll, subscriptions };
}
