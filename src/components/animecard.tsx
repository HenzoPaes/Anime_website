// src/components/AnimeCard.tsx
import React, { memo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FlatAnime } from "../hooks/useanimes";
import { useWatchlist, WATCHLIST_COLORS, WATCHLIST_LABELS } from "../hooks/usewatchlist";

// ── Config maps ───────────────────────────────────────────────────────────────

const AUDIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  legendado:    { label: "LEG",  color: "#60a5fa", bg: "rgba(59,130,246,0.18)" },
  dublado:      { label: "DUB",  color: "#c084fc", bg: "rgba(168,85,247,0.18)" },
  "dual-audio": { label: "DUAL", color: "#34d399", bg: "rgba(16,185,129,0.18)" },
};

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  "em-andamento": { label: "Em andamento", color: "#4ade80" },
  completo:       { label: "Completo",      color: "#60a5fa" },
  pausado:        { label: "Pausado",       color: "#fbbf24" },
  cancelado:      { label: "Cancelado",     color: "#f87171" },
};

// ── Variants ──────────────────────────────────────────────────────────────────

const cardVariants = {
  hidden:  { opacity: 0, y: 22, scale: 0.94 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.045, duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ── Component ─────────────────────────────────────────────────────────────────

const AnimeCard = memo(({
  anime,
  index = 0,
  watchedCount = 0,
  onClick,
}: {
  anime: FlatAnime;
  index?: number;
  watchedCount?: number;
  onClick?: (anime: FlatAnime) => void;
}) => {
  const { getStatus } = useWatchlist();
  const wlStatus = getStatus(String(anime.id));
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErr, setImgErr]       = useState(false);
  const [hovered, setHovered]     = useState(false);

  const audio    = AUDIO_CFG[anime.audioType]   ?? { label: "???", color: "#9ca3af", bg: "rgba(156,163,175,0.15)" };
  const statusCfg = STATUS_CFG[anime.status]    ?? { label: anime.status, color: "#9ca3af" };
  const eps      = anime.episodeCount || 0;
  const rating   = typeof anime.rating === "number" && anime.rating > 0 ? anime.rating.toFixed(1) : null;
  const progress = eps > 0 ? Math.min((watchedCount / eps) * 100, 100) : 0;

  const handleImgErr = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (!imgErr) {
      setImgErr(true);
      (e.target as HTMLImageElement).src =
        `https://placehold.co/300x450/0e0e12/7c3aed?text=${encodeURIComponent((anime.title || "?").slice(0, 12))}`;
    }
  }, [imgErr, anime.title]);

  return (
    <motion.article
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <Link
        to={`/anime/${encodeURIComponent(String(anime.id))}`}
        onClick={() => onClick?.(anime)}
        style={{ display: "block", textDecoration: "none" }}
      >
        <motion.div
          animate={{
            y: hovered ? -5 : 0,
            boxShadow: hovered
              ? "0 20px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.35), 0 8px 30px rgba(124,58,237,0.12)"
              : "0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
          }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          style={{
            borderRadius: 14,
            overflow: "hidden",
            background: "#0e0e12",
            position: "relative",
          }}
        >
          {/* ── POSTER AREA ─────────────────────────────────────────────── */}
          <div style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>

            {/* Skeleton shimmer while loading */}
            <AnimatePresence>
              {!imgLoaded && (
                <motion.div
                  exit={{ opacity: 0 }}
                  style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(110deg, #111116 30%, #1a1a22 50%, #111116 70%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.6s ease-in-out infinite",
                  }}
                />
              )}
            </AnimatePresence>

            <motion.img
              src={anime.cover}
              alt={anime.title}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={handleImgErr}
              animate={{ scale: hovered ? 1.06 : 1, opacity: imgLoaded ? 1 : 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />

            {/* Base gradient — always visible */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, rgba(14,14,18,0.96) 0%, rgba(14,14,18,0.2) 50%, transparent 100%)",
            }} />

            {/* Hover overlay — cinematic darkening */}
            <motion.div
              animate={{ opacity: hovered ? 1 : 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, rgba(14,14,18,1) 0%, rgba(14,14,18,0.55) 55%, rgba(0,0,0,0.25) 100%)",
              }}
            />

            {/* ── Top badges ────────────────────────────────────────────── */}
            <div style={{
              position: "absolute", top: 10, left: 10, right: 10,
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6,
            }}>
              {/* Audio badge */}
              <span style={{
                fontSize: 9, fontWeight: 800, padding: "3px 7px",
                borderRadius: 5, letterSpacing: "0.1em",
                color: audio.color, background: audio.bg,
                border: `1px solid ${audio.color}35`,
                backdropFilter: "blur(8px)",
              }}>
                {audio.label}
              </span>

              {/* Score badge */}
              {rating && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 3,
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)",
                  borderRadius: 20, padding: "3px 8px",
                  border: "1px solid rgba(251,191,36,0.2)",
                }}>
                  <span style={{ color: "#fbbf24", fontSize: 10 }}>✦</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#fde68a", letterSpacing: "0.02em" }}>
                    {rating}
                  </span>
                </div>
              )}
            </div>

            {/* Watchlist status strip — left edge accent */}
            {wlStatus && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                style={{
                  position: "absolute", top: 36, left: 10,
                  fontSize: 9, fontWeight: 700, padding: "3px 8px",
                  borderRadius: 4, letterSpacing: "0.08em",
                  backdropFilter: "blur(8px)",
                }}
                className={WATCHLIST_COLORS[wlStatus]}
              >
                {WATCHLIST_LABELS[wlStatus]}
              </motion.div>
            )}

            {/* ── Play button ───────────────────────────────────────────── */}
            <motion.div
              animate={{ opacity: hovered ? 1 : 0, scale: hovered ? 1 : 0.75 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{
                position: "absolute",
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 50, height: 50, borderRadius: "50%",
                background: "rgba(124,58,237,0.9)",
                backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 0 8px rgba(124,58,237,0.15), 0 8px 30px rgba(124,58,237,0.5)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 3 }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </motion.div>

            {/* ── Hover quick-info panel ────────────────────────────────── */}
            <AnimatePresence>
              {hovered && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22 }}
                  style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    padding: "10px 12px 12px",
                  }}
                >
                  {/* Genre chips */}
                  {anime.genre && anime.genre.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {anime.genre.slice(0, 3).map(g => (
                        <span key={g} style={{
                          fontSize: 9, fontWeight: 600, padding: "2px 6px",
                          borderRadius: 4, letterSpacing: "0.05em",
                          background: "rgba(124,58,237,0.2)",
                          border: "1px solid rgba(124,58,237,0.3)",
                          color: "rgba(196,181,253,0.9)",
                        }}>
                          {g}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Studio + eps row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {anime.studio && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                        {anime.studio}
                      </span>
                    )}
                    <span style={{
                      fontSize: 10, color: "rgba(255,255,255,0.5)",
                      display: "flex", alignItems: "center", gap: 3,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="2" width="20" height="20" rx="3" />
                        <path d="M7 8h10M7 12h10M7 16h6" />
                      </svg>
                      {eps} eps
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Progress bar ──────────────────────────────────────────── */}
            {progress > 0 && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                height: 2.5, background: "rgba(255,255,255,0.06)",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                  style={{
                    height: "100%",
                    background: progress >= 100
                      ? "linear-gradient(90deg, #22c55e, #4ade80)"
                      : "linear-gradient(90deg, #7c3aed, #a855f7)",
                    boxShadow: progress >= 100
                      ? "0 0 6px rgba(34,197,94,0.6)"
                      : "0 0 6px rgba(124,58,237,0.6)",
                  }}
                />
              </div>
            )}
          </div>

          {/* ── INFO SECTION ────────────────────────────────────────────── */}
          <div style={{ padding: "10px 12px 12px" }}>
            {/* Title */}
            <h2 style={{
              fontSize: 13, fontWeight: 700, lineHeight: 1.35,
              marginBottom: 7, letterSpacing: "-0.01em",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden",
              color: hovered ? "#e9d5ff" : "#f1f5f9",
              transition: "color 0.2s",
            }}>
              {anime.title}
            </h2>

            {/* Status + year row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 6,
            }}>
              {/* Status pill */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: statusCfg.color, flexShrink: 0,
                  boxShadow: `0 0 5px ${statusCfg.color}80`,
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  maxWidth: 90,
                }}>
                  {statusCfg.label}
                </span>
              </div>

              {/* Year */}
              {anime.year && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                  {anime.year}
                </span>
              )}
            </div>

            {/* Watch progress text */}
            {watchedCount > 0 && eps > 0 && (
              <div style={{
                marginTop: 7, paddingTop: 7,
                borderTop: "1px solid rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                  Progresso
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: progress >= 100 ? "#4ade80" : "#a78bfa",
                }}>
                  {watchedCount}/{eps}
                  {progress >= 100 && " ✓"}
                </span>
              </div>
            )}
          </div>

          {/* Left accent border — colored by status */}
          <motion.div
            animate={{ opacity: hovered ? 1 : 0, scaleY: hovered ? 1 : 0.4 }}
            transition={{ duration: 0.25 }}
            style={{
              position: "absolute", left: 0, top: "15%", bottom: "15%",
              width: 2, borderRadius: 2,
              background: `linear-gradient(to bottom, transparent, ${statusCfg.color}, transparent)`,
              transformOrigin: "center",
            }}
          />
        </motion.div>
      </Link>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </motion.article>
  );
});

AnimeCard.displayName = "AnimeCard";
export default AnimeCard;