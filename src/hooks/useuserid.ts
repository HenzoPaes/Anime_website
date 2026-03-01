// src/hooks/useUserId.ts
// Gera um UUID v4 para o usuário anônimo e persiste no localStorage.
// O UUID é só um identificador — os DADOS ficam no servidor em userData/<userId>/
// localStorage é aceitável aqui: sem UUID não há como identificar o usuário.

let _cached: string | null = null;

export function getUserId(): string {
  if (_cached) return _cached;

  const stored = localStorage.getItem("animeverse_user_id");
  if (stored && isValidUUID(stored)) {
    _cached = stored;
    return stored;
  }

  const id = generateUUIDv4();
  localStorage.setItem("animeverse_user_id", id);
  _cached = id;
  return id;
}

function generateUUIDv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function isValidUUID(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
}

/** Reseta o ID (uso em dev/debug) */
export function resetUserId(): string {
  _cached = null;
  localStorage.removeItem("animeverse_user_id");
  return getUserId();
}