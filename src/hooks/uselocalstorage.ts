import { useState } from "react";

export function useLocalStorage<T>(key: string, init: T) {
  const [val, setVal] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? init; }
    catch { return init; }
  });
  const set = (v: T | ((p: T) => T)) => {
    const next = typeof v === "function" ? (v as (p: T) => T)(val) : v;
    setVal(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return [val, set] as const;
}
