// src/types/anime.ts

import { Episode } from "./index";

export type AnimeType   = "sub" | "dub";
export type AnimeStatus = "ongoing" | "finished" | "upcoming";

export interface AudioOption {
  type:               AnimeType;
  label:              string;
  available:          boolean;
  episodesAvailable:  number;
}

export interface AnimeSeason {
  season:         number;
  seasonLabel:    string;
  year:           number;
  episodes:       number;
  currentEpisode: number;
  status:         AnimeStatus;
  score:          number;
  synopsis:       string;
  trailer:        string;
  audios:         AudioOption[];
  episodeList?:   Episode[];
}

export interface Anime {
  id:                   string;
  title:                string;
  titleRomaji:          string;
  titleJapanese:        string;
  genre:                string[];
  studio:               string;
  recommended:          boolean;
  recommendationReason: string | null;
  tags:                 string[];
  malId:                number;
  coverImage:           string;
  bannerImage:          string;
  seasons:              AnimeSeason[];
  adultContent?:        boolean;
}

// Genres that indicate adult content
export const ADULT_GENRES = [
  "hentai", "ecchi", "adult", "sexual", "nsfw", "erotic", "pornography",
  "boys love", "girls love", "yaoi", "yuri", "harem", "incest",
  "voyeur", "fetish", "bdsm", "milf", "loli", "shota", "netorare", "trap", "femboy"
];

// Helper to check if anime is adult content based on genres or explicit flag
export function isAdultAnime(anime: Anime): boolean {
  if (anime.adultContent === true) return true;
  const lowerGenres = anime.genre.map(g => g.toLowerCase());
  return ADULT_GENRES.some(adult => 
    lowerGenres.some(genre => genre.includes(adult))
  );
}

// Helper: retorna a temporada mais recente de um anime
export function getLatestSeason(anime: Anime): AnimeSeason {
  return anime.seasons[anime.seasons.length - 1];
}

// Helper: retorna o score mais alto entre as temporadas
export function getBestScore(anime: Anime): number {
  return Math.max(...anime.seasons.map((s) => s.score));
}

// Helper: verifica se anime tem alguma temporada em exibição
export function isOngoing(anime: Anime): boolean {
  return anime.seasons.some((s) => s.status === "ongoing");
}

// Helper: retorna audios disponíveis de uma temporada específica
export function getAvailableAudios(season: AnimeSeason): AudioOption[] {
  return season.audios.filter((a) => a.available);
}
