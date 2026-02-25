// src/hooks/useUserId.ts
// Gera um ID único para o usuário anônimo e persiste no localStorage.
// Isso permite salvar watchlist e histórico localmente sem precisar de login.

let _cached: string | null = null;

export function getUserId(): string {
  if (_cached) return _cached;
  const stored = localStorage.getItem("animeverse_user_id");
  if (stored) { _cached = stored; return stored; }
  // Gera um UUID v4 simples
  const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  localStorage.setItem("animeverse_user_id", id);
  _cached = id;
  return id;
}