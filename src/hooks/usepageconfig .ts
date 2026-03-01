import { useState, useEffect } from "react";

const PAGE_CONFIG_URL =
  "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/pageconfig.json";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface AnnouncementConfig {
  enabled: boolean;
  text: string;
  type: "info" | "warning" | "success";
  dismissible: boolean;
}

export interface PageConfig {
  /** ID do anime exibido no Hero da home (vazio = maior nota) */
  featuredAnimeId?: string;

  /** Texto do badge sobre o título no Hero */
  heroBadgeText?: string;

  /** Texto do botão principal do Hero */
  heroCtaText?: string;

  /** Título da aba do browser */
  siteTitle?: string;

  /** Título da seção de catálogo */
  catalogTitle?: string;

  /** Mostrar botão "Anime Aleatório" */
  showRandomButton?: boolean;

  /** Banner de aviso no topo da home */
  announcement?: AnnouncementConfig;

  /** Gêneros fixados no topo do filtro */
  pinnedGenres?: string[];

  /** Aplica blur no banner do Hero */
  featuredBannerBlur?: boolean;

  /** Data da última atualização */
  lastUpdated?: string;
}

export const DEFAULT_CONFIG: PageConfig = {
  featuredAnimeId: "",
  heroBadgeText: "⭐ Melhor avaliado",
  heroCtaText: "Assistir agora",
  siteTitle: "AnimeVerse — Seu portal de animes",
  catalogTitle: "Todos os Animes",
  showRandomButton: true,
  announcement: {
    enabled: false,
    text: "",
    type: "info",
    dismissible: true,
  },
  pinnedGenres: [],
  featuredBannerBlur: false,
  lastUpdated: "",
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePageConfig() {
  const [config, setConfig] = useState<PageConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // cache-bust com timestamp para garantir dados frescos
    fetch(`${PAGE_CONFIG_URL}?t=${Date.now()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Partial<PageConfig>) => {
        setConfig({ ...DEFAULT_CONFIG, ...data });
        setError(null);
      })
      .catch((e) => {
        setError(e.message);
        // usa defaults silenciosamente
      })
      .finally(() => setLoading(false));
  }, []);

  return { config, loading, error };
}