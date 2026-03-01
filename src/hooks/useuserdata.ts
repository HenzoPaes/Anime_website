// src/hooks/useUserData.ts
// Hook genérico que lê/grava uma coleção de dados do usuário via API.
// Todas as coleções ficam em /api/user/:userId/:collection (servidor).
//
// Padrão: otimista (atualiza o estado local imediatamente)
//         + debounce de 400ms para salvar no servidor.
//
// Coleções disponíveis: "watchlist" | "watched" | "history" | "subscriptions" | "ep-counts"

import { useState, useEffect, useRef, useCallback } from "react";
import { getUserId } from "./useuserid";

const BASE = "/api/user";
const DEBOUNCE_MS = 400;

export type SyncState = "idle" | "loading" | "syncing" | "error";

export interface UserDataResult<T> {
  data:     T;
  setData:  (updater: T | ((prev: T) => T)) => void;
  /** Força um re-fetch do servidor (ignora cache) */
  refetch:  () => void;
  state:    SyncState;
  error:    string | null;
  /** true enquanto o primeiro carregamento não terminou */
  loading:  boolean;
  /** true enquanto uma escrita está sendo enviada */
  syncing:  boolean;
}

export function useUserData<T>(
  collection: string,
  defaultValue: T,
): UserDataResult<T> {
  const userId = getUserId();

  const [data, _setData]      = useState<T>(defaultValue);
  const [state, setState]     = useState<SyncState>("loading");
  const [error, setError]     = useState<string | null>(null);

  // Refs para evitar stale closures no debounce
  const latestRef  = useRef<T>(defaultValue);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    setState("loading");
    fetch(`${BASE}/${userId}/${collection}`)
      .then(r => {
        if (r.status === 404) return defaultValue;   // ainda sem dados — usa default
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then(d => {
        if (!mountedRef.current) return;
        latestRef.current = d;
        _setData(d);
        setState("idle");
        setError(null);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        console.warn(`[useUserData] Falha ao carregar '${collection}':`, err);
        setState("error");
        setError(`Erro ao carregar dados (${collection})`);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, collection]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Save (com debounce) ───────────────────────────────────────────────────
  const saveToApi = useCallback((value: T) => {
    setState("syncing");
    fetch(`${BASE}/${userId}/${collection}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
      .then(() => {
        if (!mountedRef.current) return;
        setState("idle");
        setError(null);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        console.warn(`[useUserData] Falha ao salvar '${collection}':`, err);
        setState("error");
        setError(`Erro ao salvar dados (${collection})`);
      });
  }, [userId, collection]);

  // ── setData público ───────────────────────────────────────────────────────
  const setData = useCallback((updater: T | ((prev: T) => T)) => {
    _setData(prev => {
      const next = typeof updater === "function"
        ? (updater as (p: T) => T)(prev)
        : updater;

      latestRef.current = next;

      // Debounce o save
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveToApi(latestRef.current), DEBOUNCE_MS);

      return next;
    });
  }, [saveToApi]);

  return {
    data,
    setData,
    refetch:  fetchData,
    state,
    error,
    loading:  state === "loading",
    syncing:  state === "syncing",
  };
}

// ── Utilitário: limpar todas as coleções (logout/reset) ───────────────────────
export async function clearAllUserData(): Promise<void> {
  const userId = getUserId();
  const cols = ["watchlist", "watched", "history", "subscriptions", "ep-counts"];
  await Promise.allSettled(
    cols.map(col => fetch(`${BASE}/${userId}/${col}`, { method: "DELETE" }))
  );
}