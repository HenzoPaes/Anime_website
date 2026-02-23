import { useState, useEffect } from "react";
import { Anime } from "../types";

export function useAnimes() {
  const [animes, setAnimes] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAnimes() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/animes");
      if (!res.ok) throw new Error("Falha ao carregar animes");
      setAnimes(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAnimes(); }, []);
  return { animes, loading, error, refetch: fetchAnimes };
}

export function useAnime(id: string) {
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/animes/${encodeURIComponent(id)}`)
      .then((r) => { if (!r.ok) throw new Error("Não encontrado"); return r.json(); })
      .then(setAnime)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [id]);

  return { anime, loading, error };
}

export async function saveAnime(anime: Anime, apiKey: string) {
  const res = await fetch("/api/animes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(anime),
  });
  return res.json();
}

export async function deleteAnime(id: string, apiKey: string) {
  const res = await fetch(`/api/animes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "x-api-key": apiKey },
  });
  return res.json();
}

export async function fetchBackups(apiKey: string): Promise<string[]> {
  const res = await fetch("/api/backups", { headers: { "x-api-key": apiKey } });
  return res.json();
}

export async function restoreBackup(name: string, apiKey: string) {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}/restore`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });
  return res.json();
}
