import { useLocalStorage } from "./useLocalStorage";
import { PersonalList, ListStatus } from "../types";

export function usePersonalList() {
  const [list, setList] = useLocalStorage<PersonalList>("personal-list", {});

  const setStatus = (animeId: string, status: ListStatus) => {
    setList((p) => ({
      ...p,
      [animeId]: { animeId, status, addedAt: new Date().toISOString() },
    }));
  };

  const removeFromList = (animeId: string) => {
    setList((p) => {
      const next = { ...p };
      delete next[animeId];
      return next;
    });
  };

  const getStatus = (animeId: string): ListStatus | null =>
    list[animeId]?.status ?? null;

  const getByStatus = (status: ListStatus) =>
    Object.values(list).filter((e) => e.status === status);

  return { list, setStatus, removeFromList, getStatus, getByStatus };
}
