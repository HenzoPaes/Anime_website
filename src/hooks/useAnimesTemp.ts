// src/hooks/useAnimes.ts
// ⚠️  NÃO importa animes.json — lê da API /api/animes que lê da pasta Animes/
import { useState, useEffect, useMemo } from "react";
import { Anime, AnimeSeason } from "../types/anime";
import { Episode } from "../types";

// ─── FlatAnime ────────────────────────────────────────────────────────────────
export interface FlatAnime {
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
  episodes:             Episode[];
}

function mapStatus(s: string): FlatAnime["status"] {
  if (s === "ongoing")  return "em-andamento";
  if (s === "finished") return "completo";
  return "pausado";
}

function deriveAudioType(season?: AnimeSeason): FlatAnime["audioType"] {
  if (!season?.audios) return "legendado";
  const hasSub = season.audios.some(a => a.type === "sub" && a.available);
  const hasDub = season.audios.some(a => a.type === "dub" && a.available);
  if (hasSub && hasDub) return "dual-audio";
  if (hasDub)           return "dublado";
  return "legendado";
}

export function flatten(raw: any): FlatAnime {
  const seasons: AnimeSeason[] = raw.seasons ?? [];
  const latest = seasons[seasons.length - 1];
  const episodesList: Episode[] = seasons.flatMap((s: any) =>
    (s.episodeList ?? []).map((e: any) => ({ ...e, season: s.season }))
  );
  return {
    id:                   raw.id ?? "",
    title:                raw.title ?? "",
    rating:               latest?.score ?? 0,
    audioType:            deriveAudioType(latest),
    status:               mapStatus(latest?.status ?? "finished"),
    genres:               raw.genre ?? [],
    episodeCount:         episodesList.length > 0 ? episodesList.length : (latest?.episodes ?? 0),
    banner:               raw.bannerImage ?? "",
    cover:                raw.coverImage ?? "",
    synopsis:             latest?.synopsis ?? "",
    year:                 latest?.year ?? new Date().getFullYear(),
    titleRomaji:          raw.titleRomaji ?? raw.title ?? "",
    titleJapanese:        raw.titleJapanese ?? raw.title ?? "",
    studio:               raw.studio ?? "Desconhecido",
    recommended:          raw.recommended ?? false,
    recommendationReason: raw.recommendationReason ?? null,
    tags:                 raw.tags ?? [],
    malId:                raw.malId ?? 0,
    coverImage:           raw.coverImage ?? "",
    bannerImage:          raw.bannerImage ?? "",
    genre:                raw.genre ?? [],
    seasons,
    episodes:             episodesList,
  };
}

// ─── Cache em memória ────────────────────────────────────────────────────────
let _cache: FlatAnime[] | null = null;
let _promise: Promise<FlatAnime[]> | null = null;

function loadAnimes(): Promise<FlatAnime[]> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = fetch("/api/animes")
    .then(r => r.json())
    .then((data: any[]) => {
      _cache = data.map(flatten);
      _promise = null;
      return _cache;
    })
    .catch(err => {
      console.error("[useAnimes] Erro ao carregar:", err);
      _promise = null;
      _cache = [];
      return [];
    });
  return _promise;
}

// ─── Hook principal ───────────────────────────────────────────────────────────
export function useAnimes() {
  const [animes, setAnimes] = useState<FlatAnime[]>(_cache ?? []);
  const [loading, setLoading] = useState(_cache === null);
  const [error,   setError  ] = useState<string | null>(null);

  useEffect(() => {
    if (_cache !== null) { setAnimes(_cache); setLoading(false); return; }
    setLoading(true);
    loadAnimes()
      .then(data => { setAnimes(data); setLoading(false); })
      .catch(() => { setError("Erro ao carregar animes."); setLoading(false); });
  }, []);

  const refetch = async () => {
    _cache = null;
    _promise = null;
    setLoading(true);
    const data = await loadAnimes();
    setAnimes(data);
    setLoading(false);
  };

  return { animes, loading, error, refetch };
}

// ─── Hooks auxiliares ─────────────────────────────────────────────────────────
export function useAnimeById(id: string): FlatAnime | undefined {
  const { animes } = useAnimes();
  return useMemo(() => animes.find(a => a.id === id), [animes, id]);
}

export function useAnime(id: string) {
  const { animes, loading } = useAnimes();
  const anime = useMemo(() => animes.find(a => a.id === id), [animes, id]);
  return { anime, loading };
}

export function useRelated(anime?: FlatAnime): FlatAnime[] {
  const { animes } = useAnimes();
  return useMemo(() => {
    if (!anime) return [];
    return animes
      .filter(a => a.id !== anime.id && a.genres.some(g => anime.genres.includes(g)))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);
  }, [anime, animes]);
}

export function useGenres(): string[] {
  const { animes } = useAnimes();
  return useMemo(() => {
    const set = new Set<string>();
    animes.forEach(a => a.genres.forEach(g => set.add(g)));
    return Array.from(set).sort();
  }, [animes]);
}

// ─── Funções admin ────────────────────────────────────────────────────────────
export async function saveAnime(anime: any, apiKey: string) {
  const res = await fetch("/api/animes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(anime),
  });
  _cache = null; _promise = null;
  return res.json();
}

export async function deleteAnime(id: string, apiKey: string) {
  const res = await fetch(`/api/animes/${id}`, {
    method: "DELETE",
    headers: { "x-api-key": apiKey },
  });
  _cache = null; _promise = null;
  return res.json();
}

export async function fetchBackups(apiKey: string): Promise<string[]> {
  const res = await fetch("/api/backups", { headers: { "x-api-key": apiKey } });
  return res.json();
}

export async function restoreBackup(name: string, apiKey: string) {
  const res = await fetch(`/api/backups/${name}/restore`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });
  _cache = null; _promise = null;
  return res.json();
}
