// src/hooks/useLocalStorage.ts
// ⚠️  DEPRECATED para dados de usuário — use useUserData() para watchlist, histórico, etc.
// ✅  Ainda OK para estado de UI local (preferências de interface, dismiss de banners, etc.)
//
// Exemplos válidos de uso:
//   - InstallPrompt: "installPromptDismissed" (UI local, não é dado do usuário)
//   - AdultContent gate: sessionStorage (já usa sessionStorage, não localStorage)
//   - Tema do app (dark/light) se houver no futuro
//
// NÃO use para: watchlist, histórico, episódios assistidos, inscrições, notificações.

import { useState } from "react";

export function useLocalStorage<T>(key: string, init: T) {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : init;
    } catch {
      return init;
    }
  });

  const set = (v: T | ((prev: T) => T)) => {
    const next = typeof v === "function" ? (v as (p: T) => T)(val) : v;
    setVal(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // localStorage cheio ou bloqueado — ignora silenciosamente
    }
  };

  return [val, set] as const;
}