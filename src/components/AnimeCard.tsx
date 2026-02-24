import React, { memo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Anime } from "../types"; // kept for compatibility if needed
import { FlatAnime } from "../hooks/useanimes";
import AudioBadge from "./audiobadge";
import { useWatchlist, WATCHLIST_COLORS, WATCHLIST_LABELS } from "../hooks/usewatchlist";

const STATUS_COLOR: Record<string, string> = {
  "em-andamento": "bg-green-500/20 text-green-400 border-green-500/30",
  completo: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  pausado: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  cancelado: "bg-red-500/20 text-red-400 border-red-500/30",
};
const STATUS_LABEL: Record<string, string> = {
  "em-andamento": "Em andamento",
  completo: "Completo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 28, scale: 0.93 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.06, duration: 0.38, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

const AnimeCard = memo(({ anime, index = 0, watchedCount = 0, onClick }: { anime: FlatAnime; index?: number; watchedCount?: number; onClick?: (anime: FlatAnime) => void; }) => {
  const { getStatus } = useWatchlist();
  const wlStatus = getStatus(String(anime.id));

  // segurança: usar only episodeCount já presente em FlatAnime
  const episodesLength = typeof anime.episodeCount === "number" ? anime.episodeCount : 0;

  // calcular progresso e clamp entre 0..100 (evita NaN e >100)
  const rawProgress = episodesLength > 0 ? (Number(watchedCount) / episodesLength) * 100 : 0;
  const progress = Number.isFinite(rawProgress) ? Math.min(Math.max(rawProgress, 0), 100) : 0;

  // label segura para watchlist (previne undefined)
  const watchlistLabelRaw = wlStatus ? WATCHLIST_LABELS[wlStatus] ?? String(wlStatus) : "";
  const watchlistLabelParts = watchlistLabelRaw.split(/\s+/);
  const watchlistLabelDisplay = watchlistLabelParts.length > 1 ? watchlistLabelParts.slice(1).join(" ") : watchlistLabelRaw;

  // handler de erro da imagem: previne loop infinito e usa dataset para marcar
  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    if (img.dataset.errored) return;
    img.dataset.errored = "true";
    img.onerror = null;
    const fallbackText = encodeURIComponent((anime.title ?? "Anime").slice(0, 12));
    img.src = `https://placehold.co/300x450/1a1a27/f43f5e?text=${fallbackText}`;
  };

  return (
    <motion.article
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -6, transition: { type: "spring", stiffness: 320, damping: 22 } }}
      className="group relative card-glow overflow-hidden"
    >
      <Link
          to={`/anime/${encodeURIComponent(String(anime.id))}`}
          className="block"
          aria-label={`Abrir ${anime.title}`}
          onClick={() => onClick?.(anime)}
        >
        <div className="relative rounded-xl bg-transparent border border-white/5 overflow-hidden isolate">
          <div className="relative aspect-[2/3] overflow-hidden">
            <div
              className="absolute inset-0 scale-110 blur-sm opacity-60"
              style={{
                backgroundImage: `url(${anime.cover})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <img
              src={anime.cover}
              alt={`Capa de ${anime.title}`}
              loading="lazy"
              className="relative w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onError={handleImgError}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/20 to-transparent" />
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
              <AudioBadge type={anime.audioType} size="sm" />
              <div className="flex items-center gap-1 bg-dark-900/80 backdrop-blur-sm rounded-full px-1.5 py-0.5">
                <span className="text-yellow-400 text-xs">★</span>
                <span className="text-xs font-bold text-yellow-400">{typeof anime.rating === "number" ? anime.rating.toFixed(1) : "—"}</span>
              </div>
            </div>

            {wlStatus && (
              <div className={`absolute top-9 left-2 badge border ${WATCHLIST_COLORS[wlStatus] ?? ""} text-[9px]`}>
                {watchlistLabelDisplay}
              </div>
            )}

            {progress > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-dark-900/50">
                <motion.div
                  className="h-full bg-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, delay: 0.2 + index * 0.02 }}
                />
              </div>
            )}

            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="w-14 h-14 bg-brand-500/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg shadow-brand-500/50">
                <svg className="w-7 h-7 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="p-3 flex flex-col flex-1 ">
            <h2 className="font-bold text-sm text-white line-clamp-2 leading-tight mb-1.5 group-hover:text-brand-300 transition-colors duration-200">
              {anime.title}
            </h2>

            <div className="flex flex-wrap items-center gap-1 mb-1.5">
              <span className="text-xs text-gray-500">{anime.year ?? "?"}</span>
              <span className={`badge border text-[10px] ${STATUS_COLOR[anime.status] ?? ""}`}>{STATUS_LABEL[anime.status] ?? anime.status ?? "—"}</span>
            </div>

            <div className="flex items-center gap-1 text-xs text-gray-500 mt-auto">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <span>{episodesLength}/{anime.episodeCount ?? episodesLength} eps</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
});
AnimeCard.displayName = "AnimeCard";
export default AnimeCard;