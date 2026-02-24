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

const rawAnimes   = animesData as Anime[];
const flatAnimes  = rawAnimes.map(flatten);

// ─── Hook principal — mesma assinatura de antes ──────────────────────────────
export function useAnimes() {
  const [loading, setLoading] = useState(true);
  const [error,   setError  ] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLoading(false);
    } catch {
      setError("Erro ao carregar animes.");
      setLoading(false);
    }
  }, []);

  return { animes: flatAnimes, loading, error };
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