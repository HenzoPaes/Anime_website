// src/components/AnimeCard.tsx
import React, { memo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FlatAnime } from "../hooks/useanimes";
import { useWatchlist, WATCHLIST_COLORS, WATCHLIST_LABELS } from "../hooks/usewatchlist";

const STATUS_DOT: Record<string, string> = {
  "em-andamento": "bg-green-400",
  completo: "bg-blue-400",
  pausado: "bg-yellow-400",
  cancelado: "bg-red-400",
};
const STATUS_LABEL: Record<string, string> = {
  "em-andamento": "Em andamento",
  completo: "Completo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};
const AUDIO_CFG: Record<string, { label: string; cls: string }> = {
  legendado:   { label: "LEG",  cls: "bg-blue-500/90 text-white" },
  dublado:     { label: "DUB",  cls: "bg-purple-600/90 text-white" },
  "dual-audio":{ label: "DUAL", cls: "bg-emerald-600/90 text-white" },
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

const AnimeCard = memo(({ anime, index = 0, watchedCount = 0, onClick }: {
  anime: FlatAnime; index?: number; watchedCount?: number; onClick?: (anime: FlatAnime) => void;
}) => {
  const { getStatus } = useWatchlist();
  const wlStatus = getStatus(String(anime.id));
  const [imgErr, setImgErr] = useState(false);
  const audio = AUDIO_CFG[anime.audioType] ?? { label: "???", cls: "bg-gray-600/90 text-white" };
  const eps = anime.episodeCount || 0;
  const progress = eps > 0 ? Math.min((watchedCount / eps) * 100, 100) : 0;

  const handleImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!imgErr) {
      setImgErr(true);
      (e.target as HTMLImageElement).src =
        `https://placehold.co/300x450/1a1a27/f43f5e?text=${encodeURIComponent((anime.title || "?").slice(0, 12))}`;
    }
  };

  return (
    <motion.article
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 350, damping: 25 } }}
      className="group relative"
    >
      <Link
        to={`/anime/${encodeURIComponent(String(anime.id))}`}
        className="block"
        onClick={() => onClick?.(anime)}
      >
        <div className="relative rounded-2xl overflow-hidden bg-dark-800 border border-white/5 shadow-lg group-hover:border-brand-500/40 group-hover:shadow-brand-500/10 group-hover:shadow-xl transition-all duration-300">
          
          {/* Poster */}
          <div className="relative aspect-[2/3] overflow-hidden">
            <img
              src={anime.cover}
              alt={anime.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={handleImgErr}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/30 to-transparent" />

            {/* Top badges */}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1">
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md tracking-wider ${audio.cls}`}>
                {audio.label}
              </span>
              <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-1.5 py-0.5">
                <span className="text-yellow-400 text-[10px]">★</span>
                <span className="text-[10px] font-bold text-yellow-300">
                  {typeof anime.rating === "number" && anime.rating > 0 ? anime.rating.toFixed(1) : "—"}
                </span>
              </div>
            </div>

            {/* Watchlist badge */}
            {wlStatus && (
              <div className={`absolute top-9 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${WATCHLIST_COLORS[wlStatus]}`}>
                {WATCHLIST_LABELS[wlStatus].split(" ").slice(1).join(" ")}
              </div>
            )}

            {/* Progress bar */}
            {progress > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-dark-900/60">
                <motion.div
                  className="h-full bg-brand-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                />
              </div>
            )}

            {/* Play button on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="w-12 h-12 bg-brand-500/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-xl shadow-brand-500/40 scale-90 group-hover:scale-100 transition-transform duration-200">
                <svg className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="p-3">
            <h2 className="font-bold text-sm text-white line-clamp-2 leading-snug mb-2 group-hover:text-brand-300 transition-colors">
              {anime.title}
            </h2>

            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[anime.status] ?? "bg-gray-500"}`} />
                <span>{STATUS_LABEL[anime.status] ?? anime.status}</span>
              </div>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
                </svg>
                {eps} eps
              </span>
            </div>

            {anime.year && (
              <p className="text-[10px] text-gray-600 mt-1">{anime.year}</p>
            )}
          </div>
        </div>
      </Link>
    </motion.article>
  );
});

AnimeCard.displayName = "AnimeCard";
export default AnimeCard;
