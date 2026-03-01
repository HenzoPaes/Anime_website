// src/hooks/useNotifications.ts — versão DB
// Persiste inscrições em /api/user/:userId/subscriptions
// Persiste contagens em /api/user/:userId/ep-counts
// Interface pública idêntica à versão localStorage.

import { useState, useEffect, useCallback } from "react";
import { useUserData } from "./useuserdata";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface EpisodeNotification {
  animeId:      string;
  animeTitle:   string;
  animeCover:   string;
  newEpisodes:  number;
  totalEpisodes:number;
  seenAt:       number;
}

type CountsMap = Record<string, number>; // animeId → episodeCount na última visita

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(
  animes: Array<{ id: string; title: string; cover: string; episodeCount: number }>,
) {
  // Inscrições: lista de animeIds
  const {
    data: subscriptions,
    setData: setSubscriptions,
    loading: subsLoading,
  } = useUserData<string[]>("subscriptions", []);

  // Contagens salvas (para detectar novos eps)
  const {
    data: savedCounts,
    setData: setSavedCounts,
    loading: countsLoading,
  } = useUserData<CountsMap>("ep-counts", {});

  const [notifications, setNotifications] = useState<EpisodeNotification[]>([]);

  // Detecta novos episódios quando ambos os dados estiverem carregados
  useEffect(() => {
    if (subsLoading || countsLoading || !animes.length) return;

    const newNotifs: EpisodeNotification[] = [];
    const updated: CountsMap = { ...savedCounts };
    let hasChanges = false;

    for (const anime of animes) {
      const curr = anime.episodeCount;
      const prev = savedCounts[anime.id];

      if (prev === undefined) {
        // Primeira vez vendo esse anime — registra sem notificar
        updated[anime.id] = curr;
        hasChanges = true;
        continue;
      }

      if (curr > prev && subscriptions.includes(anime.id)) {
        newNotifs.push({
          animeId:       anime.id,
          animeTitle:    anime.title,
          animeCover:    anime.cover,
          newEpisodes:   curr - prev,
          totalEpisodes: curr,
          seenAt:        0,
        });
        // NÃO atualiza o count ainda — só quando o usuário marcar como lido
      }
    }

    if (hasChanges) setSavedCounts(updated);
    if (newNotifs.length > 0) {
      setNotifications(prev => {
        // Evita duplicatas
        const existingIds = new Set(prev.map(n => n.animeId));
        const fresh = newNotifs.filter(n => !existingIds.has(n.animeId));
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animes.length, subsLoading, countsLoading]);

  // ── Inscrição ─────────────────────────────────────────────────────────────

  const isSubscribed = useCallback(
    (animeId: string) => subscriptions.includes(animeId),
    [subscriptions],
  );

  const toggleSubscription = useCallback(
    (animeId: string) => {
      setSubscriptions(prev =>
        prev.includes(animeId)
          ? prev.filter(id => id !== animeId)
          : [...prev, animeId],
      );
    },
    [setSubscriptions],
  );

  // ── Dispensar notificações ────────────────────────────────────────────────

  const dismissNotification = useCallback(
    (animeId: string) => {
      const anime = animes.find(a => a.id === animeId);
      if (anime) {
        setSavedCounts(prev => ({ ...prev, [animeId]: anime.episodeCount }));
      }
      setNotifications(prev => prev.filter(n => n.animeId !== animeId));
    },
    [animes, setSavedCounts],
  );

  const dismissAll = useCallback(() => {
    const updated: CountsMap = { ...savedCounts };
    for (const anime of animes) {
      updated[anime.id] = anime.episodeCount;
    }
    setSavedCounts(updated);
    setNotifications([]);
  }, [animes, savedCounts, setSavedCounts]);

  return {
    notifications,
    totalNew:            notifications.length,
    isSubscribed,
    toggleSubscription,
    dismissNotification,
    dismissAll,
    subscriptions,
    loading:             subsLoading || countsLoading,
  };
}