// src/hooks/useAnimes.ts
import { useState, useEffect, useMemo } from "react";
import { Anime, AnimeSeason } from "../types/anime";
import { Episode } from "../types";
import animesData from "../../animes.json";

// ─── FlatAnime: compatível com HomePage (campos antigos) + AnimeCard (seasons) ──
export interface FlatAnime {
  // Campos legados que o HomePage já usa
  id:           string;
  title:        string;
  rating:       number;
  audioType:    "legendado" | "dublado" | "dual-audio";
  status:       "em-andamento" | "completo" | "pausado";
  genres:       string[];
  episodeCount: number;
  banner:       string;
  cover:        string;
  synopsis:     string;
  year:         number;

  // Campos novos (AnimeCard, AnimeDetailPage)
  titleRomaji:          string;
  titleJapanese:        string;
  studio:               string;
  recommended:          boolean;
  recommendationReason: string | null;
  tags:                 string[];
  malId:                number;
  coverImage:           string;
  bannerImage:          string;
  genre:                string[];
  seasons:              AnimeSeason[];
  // Lista plana de episódios (usada pelo player / EpisodePage)
  episodes:             Episode[];
}

// Mapa de status novo → antigo
function mapStatus(s: string): FlatAnime["status"] {
  if (s === "ongoing")  return "em-andamento";
  if (s === "finished") return "completo";
  return "pausado";
}

// Deriva audioType da temporada mais recente
function deriveAudioType(season: AnimeSeason): FlatAnime["audioType"] {
  const hasSub = season.audios.some((a) => a.type === "sub" && a.available);
  const hasDub = season.audios.some((a) => a.type === "dub" && a.available);
  if (hasSub && hasDub) return "dual-audio";
  if (hasDub)           return "dublado";
  return "legendado";
}

// Converte Anime (JSON novo) → FlatAnime
function flatten(anime: Anime): FlatAnime {
  const latest = anime.seasons[anime.seasons.length - 1];
  // Agrega episódios detalhados por temporada quando disponíveis
  const episodesList: Episode[] = anime.seasons.flatMap((s) =>
    (s.episodeList || []).map((e) => ({ ...e, season: s.season }))
  );
  return {
    id:           anime.id,
    title:        anime.title,
    rating:       latest.score,
    audioType:    deriveAudioType(latest),
    status:       mapStatus(latest.status),
    genres:       anime.genre,
    episodeCount: episodesList.length > 0 ? episodesList.length : latest.episodes,
    banner:       anime.bannerImage,
    cover:        anime.coverImage,
    synopsis:     latest.synopsis,
    year:         latest.year,
    titleRomaji:          anime.titleRomaji,
    titleJapanese:        anime.titleJapanese,
    studio:               anime.studio,
    recommended:          anime.recommended,
    recommendationReason: anime.recommendationReason,
    tags:                 anime.tags,
    malId:                anime.malId,
    coverImage:           anime.coverImage,
    bannerImage:          anime.bannerImage,
    genre:                anime.genre,
    seasons:              anime.seasons,
    episodes:             episodesList,
  };
}

// --- Runtime data source: prefer override in localStorage (dev fallback) ---
const readRawAnimes = (): Anime[] => {
  try {
    if (typeof window !== "undefined") {
      const override = window.localStorage.getItem("animes_override");
      if (override) return JSON.parse(override) as Anime[];
    }
  } catch {
    // ignore
  }
  return animesData as Anime[];
};

let rawAnimes = readRawAnimes();
let flatAnimes = rawAnimes.map(flatten);

// --- Helpers para atualizar override/localStorage quando fallback é usado ---
function persistOverride(animes: Anime[]) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("animes_override", JSON.stringify(animes));
      rawAnimes = animes;
      flatAnimes = rawAnimes.map(flatten);
    }
  } catch (e) {
    // ignore
  }
}

function pushBackup(name: string, data: Anime[]) {
  try {
    if (typeof window === "undefined") return;
    const backupsRaw = window.localStorage.getItem("animes_backups");
    const backups = backupsRaw ? JSON.parse(backupsRaw) as Record<string,string> : {};
    backups[name] = JSON.stringify(data);
    window.localStorage.setItem("animes_backups", JSON.stringify(backups));
  } catch {}
}

// --- Hook principal — mesma assinatura de antes ──────────────────────────────
export function useAnimes() {
  const [loading, setLoading] = useState(true);
  const [error,   setError  ] = useState<string | null>(null);
  const [animes, setAnimes] = useState<FlatAnime[]>(() => flatAnimes);

  useEffect(() => {
    try {
      setLoading(false);
      setAnimes(flatAnimes);
    } catch {
      setError("Erro ao carregar animes.");
      setLoading(false);
    }
  }, []);

  return { animes, loading, error, refetch: () => { rawAnimes = readRawAnimes(); flatAnimes = rawAnimes.map(flatten); setAnimes(flatAnimes); } };
}

// ─── Hooks auxiliares ─────────────────────────────────────────────────────────
export function useAnimeById(id: string): FlatAnime | undefined {
  return useMemo(() => flatAnimes.find((a) => a.id === id), [id]);
}

export function useAnime(id: string) {
  const [loading, setLoading] = useState(false);
  const anime = useAnimeById(id);
  useEffect(() => { setLoading(false); }, [id]);
  return { anime, loading };
}

export function useRecommended(): FlatAnime[] {
  return useMemo(() => flatAnimes.filter((a) => a.recommended), []);
}

export function useFeatured(): FlatAnime[] {
  return useMemo(() => flatAnimes.filter((a) => a.tags.includes("destaque")), []);
}

export function useOngoing(): FlatAnime[] {
  return useMemo(() => flatAnimes.filter((a) => a.status === "em-andamento"), []);
}

export function useRelated(anime?: FlatAnime): FlatAnime[] {
  return useMemo(() => {
    if (!anime) return [];
    return flatAnimes
      .filter((a) => a.id !== anime.id && a.genres.some((g) => anime.genres.includes(g)))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);
  }, [anime]);
}

export function useGenres(): string[] {
  return useMemo(() => {
    const set = new Set<string>();
    flatAnimes.forEach((a) => a.genres.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, []);
}

export { flatAnimes as allAnimes };

// -----------------------------------------------------------------------------
// Admin helpers: saveAnime, deleteAnime, fetchBackups, restoreBackup
// - Tentam usar endpoints HTTP (/api/admin/...) com header x-admin-key
// - Se a chamada falhar (dev), caem para um fallback que grava em localStorage
// -----------------------------------------------------------------------------

const API_PREFIX = "/api/admin";

async function apiRequest(path: string, opts: RequestInit = {}, apiKey?: string) {
  const headers: Record<string,string> = {
    ...(opts.headers as Record<string,string> || {}),
  };
  if (apiKey) headers["x-admin-key"] = apiKey;
  try {
    const res = await fetch(`${API_PREFIX}${path}`, {
      ...opts,
      headers,
      credentials: "same-origin",
    });
    const text = await res.text();
    try { return { ok: res.ok, data: text ? JSON.parse(text) : null, status: res.status }; } catch { return { ok: res.ok, data: text, status: res.status }; }
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function saveAnime(anime: Anime, apiKey?: string): Promise<{ success: boolean; message: string }> {
  // Try HTTP API first
  const r = await apiRequest("/save", { method: "POST", body: JSON.stringify({ anime }), headers: { "Content-Type": "application/json" } }, apiKey);
  if (r.ok) return { success: true, message: (r.data && (r.data.message || JSON.stringify(r.data))) || "Salvo com sucesso." };

  // Fallback: save to localStorage override and create backup
  try {
    const current = readRawAnimes();
    pushBackup(`backup_${new Date().toISOString()}`, current);
    const updated = current.filter(a => a.id !== anime.id).concat([anime]);
    persistOverride(updated);
    return { success: true, message: "Salvo localmente (fallback)." };
  } catch (e:any) {
    return { success: false, message: e?.message || "Erro ao salvar." };
  }
}

export async function deleteAnime(id: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
  const r = await apiRequest("/delete", { method: "POST", body: JSON.stringify({ id }), headers: { "Content-Type": "application/json" } }, apiKey);
  if (r.ok) return { success: true, message: (r.data && (r.data.message || JSON.stringify(r.data))) || "Deletado com sucesso." };

  try {
    const current = readRawAnimes();
    pushBackup(`backup_${new Date().toISOString()}`, current);
    const updated = current.filter(a => a.id !== id);
    persistOverride(updated);
    return { success: true, message: "Deletado localmente (fallback)." };
  } catch (e:any) {
    return { success: false, message: e?.message || "Erro ao deletar." };
  }
}

export async function fetchBackups(apiKey?: string): Promise<string[]> {
  const r = await apiRequest("/backups", { method: "GET" }, apiKey);
  if (r.ok && Array.isArray(r.data)) return r.data as string[];

  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem("animes_backups");
    if (!raw) return [];
    const obj = JSON.parse(raw) as Record<string,string>;
    return Object.keys(obj).sort().reverse();
  } catch {
    return [];
  }
}

export async function restoreBackup(name: string, apiKey?: string): Promise<{ success: boolean; message: string }> {
  const r = await apiRequest("/restore", { method: "POST", body: JSON.stringify({ name }), headers: { "Content-Type": "application/json" } }, apiKey);
  if (r.ok) return { success: true, message: (r.data && (r.data.message || JSON.stringify(r.data))) || "Restaurado com sucesso." };

  try {
    if (typeof window === "undefined") return { success: false, message: "Ambiente sem window." };
    const raw = window.localStorage.getItem("animes_backups");
    if (!raw) return { success: false, message: "Backup não encontrado." };
    const obj = JSON.parse(raw) as Record<string,string>;
    const data = obj[name];
    if (!data) return { success: false, message: "Backup não encontrado." };
    const parsed = JSON.parse(data) as Anime[];
    // Overwrite override + refresh in-memory
    persistOverride(parsed);
    return { success: true, message: "Backup restaurado localmente (fallback)." };
  } catch (e:any) {
    return { success: false, message: e?.message || "Erro ao restaurar backup." };
  }
}
