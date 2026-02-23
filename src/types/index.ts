export interface Episode {
  id: string;
  number: number;
  title: string;
  embedUrl: string;
  embedCredit?: string;
}

export type AudioType = "legendado" | "dublado" | "dual-audio" | "";
export type AnimeStatus = "em-andamento" | "completo" | "pausado" | "cancelado" | "";
export type ListStatus = "assistindo" | "concluido" | "droppado" | "quero-ver";

export interface Anime {
  id: string;
  title: string;
  alt_titles?: string[];
  cover: string;
  banner?: string;
  synopsis: string;
  genres: string[];
  year: number | null;
  status: AnimeStatus;
  rating: number | null;
  audioType: AudioType;
  episodeCount: number;
  episodes: Episode[];
  tags?: string[];
  locale?: string;
  studio?: string;
  type?: "tv" | "filme" | "especial" | "ova";
  season?: number;
}

export interface PersonalEntry {
  animeId: string;
  status: ListStatus;
  addedAt: string;
  rating?: number;
}

export interface PersonalList {
  [animeId: string]: PersonalEntry;
}
