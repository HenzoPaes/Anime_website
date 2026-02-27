export interface Episode {
  id: string;
  number: number;
  title: string;
  /**
   * Support both the old single-url (`embedUrl`) and the new object format.
   * The conversion helpers in the code will prefer `embeds` when available.
   */
  embeds: {
    sub?: string;
    dub?: string;
  };
  embedCredit?: string;
  // legacy field still tolerated, not used in new entries
  embedUrl?: string;
}

export type AudioType = "legendado" | "dublado" | "dual-audio" | "";
export type AnimeStatus = "em-andamento" | "completo" | "pausado" | "cancelado" | "";
export type ListStatus = "assistindo" | "concluido" | "droppado" | "quero-ver" | "reassistindo";

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
