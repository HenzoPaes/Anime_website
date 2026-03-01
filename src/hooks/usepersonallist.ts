// src/hooks/usePersonalList.ts — versão DB
// Nota: este hook é essencialmente um alias de useWatchlist com interface diferente.
// Mantido por compatibilidade com componentes que o importam diretamente.
// Internamente usa a mesma coleção "watchlist" no servidor para manter consistência.

import { useCallback } from "react";
import { useUserData } from "./useuserdata";

// ── Tipos (compatíveis com versão anterior) ───────────────────────────────────

export type ListStatus =
  | "assistindo"
  | "concluido"
  | "droppado"
  | "quero-ver"
  | "reassistindo";

export interface PersonalListEntry {
  animeId:   string;
  status:    ListStatus;
  addedAt:   string; // ISO string
  progress?: number;
}

export type PersonalList = Record<string, PersonalListEntry>;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePersonalList() {
  // Compartilha a mesma coleção "watchlist" do servidor com useWatchlist.
  // Assim os dados ficam sincronizados entre os dois hooks.
  const {
    data: list,
    setData: setList,
    loading,
    syncing,
  } = useUserData<PersonalList>("watchlist", {});

  const setStatus = useCallback(
    (animeId: string, status: ListStatus) => {
      setList(prev => ({
        ...prev,
        [animeId]: {
          animeId,
          status,
          addedAt:  prev[animeId]?.addedAt ?? new Date().toISOString(),
          progress: prev[animeId]?.progress ?? 0,
        },
      }));
    },
    [setList],
  );

  const removeFromList = useCallback(
    (animeId: string) => {
      setList(prev => {
        const next = { ...prev };
        delete next[animeId];
        return next;
      });
    },
    [setList],
  );

  const getStatus = (animeId: string): ListStatus | null =>
    list[animeId]?.status ?? null;

  const getByStatus = (status: ListStatus): PersonalListEntry[] =>
    Object.values(list).filter(e => e.status === status);

  return {
    list,
    setStatus,
    removeFromList,
    getStatus,
    getByStatus,
    loading,
    syncing,
  };
}