// src/pages/MovieDetailPage.tsx
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │  PÁGINA ESPECIAL PARA FILMES DE ANIME                               │
// │  Detectado via season.type === "movie" no JSON                      │
// │                                                                     │
// │  Campos extras esperados no season (além dos padrões):              │
// │   type:        "movie"                                              │
// │   movieTitle:  string          — título do filme                    │
// │   tagline:     string          — frase curta do filme               │
// │   runtime:     number          — duração em minutos                 │
// │   director:    string                                               │
// │   accentColor: string          — hex "#7c3aed" (único por filme)    │
// │   posterImage: string          — url do poster vertical             │
// │   stills:      string[]        — urls para galeria de imagens       │
// │   cast:        CastMember[]    — elenco com personagem + dublador   │
// │   awards:      string[]        — prêmios ganhos                     │
// │   ageRating:   string          — "14+", "16+" etc                   │
// └─────────────────────────────────────────────────────────────────────┘

import { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { useAnimeById } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import WatchlistButton from "../components/watchlistbutton";
import EpisodePlayer from "../components/episodeplayer";

// ── Types ─────────────────────────────────────────────────────────────────────

type AudioType = "sub" | "dub";

interface CastMember {
  character: string;
  voice: string;
  voiceDub?: string;
  img?: string;
}

interface MovieSeason {
  season: number;
  type: "movie";
  seasonLabel: string;
  movieTitle?: string;
  tagline?: string;
  year: number;
  runtime?: number;
  director?: string;
  accentColor?: string;
  posterImage?: string;
  stills?: string[];
  cast?: CastMember[];
  awards?: string[];
  ageRating?: string;
  episodes: number;
  currentEpisode: number;
  status: string;
  score?: number;
  synopsis: string;
  trailer?: string | null;
  audios: { type: string; label: string; available: boolean; episodesAvailable: number }[];
  episodeList: any[];
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useIsMobile(bp = 768) {
  const [m, setM] = useState(() => window.innerWidth < bp);
  useLayoutEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return m;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function youtubeId(url?: string | null) {
  return url?.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] ?? null;
}

function formatRuntime(min: number) {
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

// ── Film Strip Decoration ─────────────────────────────────────────────────────

function FilmStrip({ accent, accentRgb, scroll = false }: { accent: string; accentRgb: string; scroll?: boolean }) {
  const holes = Array.from({ length: 32 });
  return (
    <div style={{
      overflow: "hidden", borderTop: `1px solid rgba(${accentRgb},0.18)`, borderBottom: `1px solid rgba(${accentRgb},0.18)`,
      background: `rgba(${accentRgb},0.04)`, padding: "5px 0",
    }}>
      <motion.div
        animate={scroll ? { x: [0, -600] } : {}}
        transition={scroll ? { duration: 14, repeat: Infinity, ease: "linear" } : {}}
        style={{ display: "flex", gap: 10, padding: "0 10px", width: scroll ? "200%" : "auto" }}
      >
        {[...holes, ...(scroll ? holes : [])].map((_, i) => (
          <div key={i} style={{
            width: 16, height: 24, borderRadius: 3, flexShrink: 0,
            background: `rgba(${accentRgb},0.22)`,
            border: `1px solid rgba(${accentRgb},0.3)`,
            boxShadow: `0 0 6px rgba(${accentRgb},0.1)`,
          }} />
        ))}
      </motion.div>
    </div>
  );
}

// ── Stills Gallery (Filmstrip) ────────────────────────────────────────────────

function FilmstripGallery({ stills, accent, accentRgb }: { stills: string[]; accent: string; accentRgb: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  return (
    <>
      <div style={{ position: "relative" }}>
        {/* Fade masks */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right, #070710, transparent)`, zIndex: 2, pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to left, #070710, transparent)`, zIndex: 2, pointerEvents: "none" }} />

        {/* Top holes row */}
        <div style={{ display: "flex", gap: 0, background: "#0a0a12", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "4px 16px", overflowX: "hidden" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{ width: 18, height: 12, borderRadius: 2, flexShrink: 0, marginRight: 24, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
          ))}
        </div>

        {/* Images */}
        <div style={{
          display: "flex", gap: 4, overflowX: "auto", background: "#0a0a12",
          padding: "0 40px", scrollbarWidth: "none", cursor: "grab",
        }}>
          {stills.map((src, i) => (
            <motion.button
              key={i}
              onClick={() => setLightbox(src)}
              onMouseEnter={() => setHovIdx(i)}
              onMouseLeave={() => setHovIdx(null)}
              animate={{ scale: hovIdx === i ? 1.03 : 1, filter: hovIdx === i ? "brightness(1.1)" : "brightness(0.8)" }}
              transition={{ duration: 0.22 }}
              style={{
                flexShrink: 0, width: 280, height: 158, padding: 0,
                border: hovIdx === i ? `2px solid rgba(${accentRgb},0.7)` : "2px solid transparent",
                cursor: "zoom-in", background: "#111",
                position: "relative", overflow: "hidden",
                transition: "border-color 0.2s",
              }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {/* Frame number */}
              <div style={{
                position: "absolute", bottom: 6, right: 8,
                fontFamily: "monospace", fontSize: 10, fontWeight: 700,
                color: `rgba(${accentRgb},0.7)`, letterSpacing: "0.1em",
              }}>
                ◈ {String(i + 1).padStart(3, "0")}
              </div>
              {hovIdx === i && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  style={{ position: "absolute", inset: 0, background: `rgba(${accentRgb},0.08)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 28, opacity: 0.8 }}>⊕</span>
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>

        {/* Bottom holes row */}
        <div style={{ display: "flex", gap: 0, background: "#0a0a12", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "4px 16px", overflowX: "hidden" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{ width: 18, height: 12, borderRadius: 2, flexShrink: 0, marginRight: 24, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.96)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}
          >
            <motion.img
              src={lightbox} alt=""
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: "88vw", maxHeight: "82vh", objectFit: "contain",
                borderRadius: 4, boxShadow: `0 0 0 1px rgba(${accentRgb},0.3), 0 40px 100px rgba(0,0,0,0.8)`,
              }}
            />
            <button onClick={() => setLightbox(null)} style={{
              position: "absolute", top: 20, right: 20,
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10, color: "#fff", width: 40, height: 40, cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Audio Toggle ──────────────────────────────────────────────────────────────

function AudioToggle({ audio, onChange, audios, accentRgb }: {
  audio: AudioType; onChange: (a: AudioType) => void; audios: any[]; accentRgb: string;
}) {
  const available = audios.filter(a => a.available);
  if (available.length <= 1) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 3, gap: 2 }}>
      {(["sub", "dub"] as AudioType[]).map(type => {
        const has = audios.some(a => a.type === type && a.available);
        if (!has) return null;
        const active = audio === type;
        return (
          <button key={type} onClick={() => onChange(type)} style={{
            padding: "5px 14px", borderRadius: 6, border: "none",
            fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" as const,
            cursor: "pointer", transition: "all 0.18s",
            background: active ? `rgba(${accentRgb},1)` : "transparent",
            color: active ? "#fff" : "rgba(255,255,255,0.38)",
            boxShadow: active ? `0 2px 12px rgba(${accentRgb},0.5)` : "none",
          }}>
            {type === "sub" ? "LEG" : "DUB"}
          </button>
        );
      })}
    </div>
  );
}

// ── Cast Card ─────────────────────────────────────────────────────────────────

function CastCard({ member, accentRgb, audio }: { member: CastMember; accentRgb: string; audio: AudioType }) {
  const [hov, setHov] = useState(false);
  const voice = audio === "dub" && member.voiceDub ? member.voiceDub : member.voice;
  return (
    <motion.div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      animate={{ y: hov ? -4 : 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      style={{
        background: hov ? `rgba(${accentRgb},0.08)` : "rgba(255,255,255,0.03)",
        border: hov ? `1px solid rgba(${accentRgb},0.3)` : "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, padding: "14px 16px",
        transition: "background 0.2s, border-color 0.2s",
        cursor: "default",
      }}
    >
      {/* Avatar placeholder with initials */}
      <div style={{
        width: 44, height: 44, borderRadius: "50%", marginBottom: 10,
        background: hov ? `rgba(${accentRgb},0.2)` : "rgba(255,255,255,0.07)",
        border: `2px solid rgba(${accentRgb},${hov ? 0.5 : 0.15})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 800, color: hov ? `rgb(${accentRgb})` : "rgba(255,255,255,0.35)",
        transition: "all 0.2s",
        overflow: "hidden",
      }}>
        {member.img
          ? <img src={member.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : member.character.charAt(0)
        }
      </div>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 3, lineHeight: 1.2 }}>{member.character}</p>
      <p style={{ fontSize: 11, color: `rgba(${accentRgb},0.8)`, fontWeight: 500 }}>{voice}</p>
    </motion.div>
  );
}

// ── Stat Pill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, label, value, accentRgb }: { icon: string; label: string; value: string; accentRgb: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontWeight: 700 }}>{label}</p>
        <p style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>{value}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MovieDetailPage() {
  const { id, season: seasonParam } = useParams<{ id: string; season?: string }>();
  const anime = useAnimeById(decodeURIComponent(id ?? ""));
  const navigate = useNavigate();
  const { markEpisode, isWatched, unmarkEpisode } = useWatched();
  const isMobile = useIsMobile();

  const [audio, setAudio] = useState<AudioType>("sub");
  const [showPlayer, setShowPlayer] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Parallax hero
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const bannerY = useTransform(scrollY, [0, 500], [0, 120]);

  // Find movie season (type=movie OR season=0)
  const movie = useMemo<MovieSeason | null>(() => {
    if (!anime) return null;
    const targetSeason = seasonParam ? parseInt(seasonParam) : 0;
    return (anime.seasons?.find((s: any) =>
      s.type === "movie" || s.season === targetSeason
    ) as MovieSeason) ?? null;
  }, [anime, seasonParam]);

  const movieEp = useMemo(() => movie?.episodeList?.[0] ?? null, [movie]);

  useEffect(() => {
    if (!anime || !movie) return;
    const title = movie.movieTitle ?? `${anime.title}: ${movie.seasonLabel}`;
    document.title = `${title} | AnimeVerse`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [anime?.id, movie?.season]);

  const accent     = movie?.accentColor ?? "#dc2626";
  const accentRgb  = useMemo(() => { try { return hexToRgb(accent); } catch { return "220,38,38"; } }, [accent]);
  const stills     = movie?.stills ?? [];
  const cast       = movie?.cast ?? [];
  const awards     = movie?.awards ?? [];
  const ytId       = youtubeId(movie?.trailer);

  const embedSrc = useMemo(() => {
    if (!movieEp) return "";
    const em = movieEp.embeds ?? {};
    return em[audio] || em.sub || em.dub || "";
  }, [movieEp, audio]);

  const watched = anime && movieEp ? isWatched(anime.id, movieEp.id) : false;

  const movieTitle = movie?.movieTitle ?? (anime ? `${anime.title}: ${movie?.seasonLabel ?? "Filme"}` : "Filme");
  const tagline    = movie?.tagline ?? "";

  if (!anime || !movie) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#070710" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid rgba(220,38,38,0.3)", borderTopColor: "#dc2626", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#070710", color: "#fff", position: "relative", overflow: "hidden" }}>

      {/* ── GLOBAL AMBIENT GLOW ──────────────────────────────────────────── */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "20%", width: "60%", height: "50%", borderRadius: "50%", background: `radial-gradient(ellipse, rgba(${accentRgb},0.07) 0%, transparent 70%)`, filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: "5%", right: "-5%", width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, rgba(${accentRgb},0.04) 0%, transparent 70%)`, filter: "blur(80px)" }} />
      </div>

      {/* ── FILM GRAIN ───────────────────────────────────────────────────── */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, opacity: 0.45,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
      }} />

      <div style={{ position: "relative", zIndex: 2 }}>

        {/* ── TOP FILM STRIP (animated) ────────────────────────────────── */}
        <FilmStrip accent={accent} accentRgb={accentRgb} scroll />

        {/* ── NAV BAR ──────────────────────────────────────────────────── */}
        <div style={{ padding: "14px clamp(16px, 5vw, 72px)", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <Link to={`/anime/${encodeURIComponent(anime.id)}`} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "7px 14px",
            borderRadius: 9, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 500, textDecoration: "none",
            transition: "all 0.15s",
          }}>
            ← {anime.title}
          </Link>
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>/</span>
          <span style={{
            padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const,
            background: `rgba(${accentRgb},0.12)`, border: `1px solid rgba(${accentRgb},0.3)`, color: accent,
          }}>
            🎬 Filme
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{movie.seasonLabel}</span>
        </div>

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div ref={heroRef} style={{ position: "relative", minHeight: isMobile ? "auto" : "92vh", display: "flex", flexDirection: "column" }}>

          {/* Parallax banner */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 0 }}>
            <motion.img
              src={anime.bannerImage || anime.coverImage}
              alt=""
              onLoad={() => setImgLoaded(true)}
              style={{ width: "100%", height: "120%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.15) saturate(0.8)", y: bannerY } as any}
            />
            {/* Accent color tint */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, rgba(${accentRgb},0.12) 0%, transparent 60%)` }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #070710 0%, rgba(7,7,16,0.6) 40%, transparent 100%)" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(7,7,16,0.98) 0%, rgba(7,7,16,0.7) 45%, rgba(7,7,16,0.1) 100%)" }} />
          </div>

          {/* Hero content */}
          <div style={{
            position: "relative", zIndex: 3, flex: 1,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "auto 1fr",
            gap: isMobile ? 24 : 60,
            alignItems: "flex-end",
            padding: isMobile ? "32px 16px 40px" : "80px clamp(24px, 6vw, 88px) 60px",
          }}>

            {/* ── LEFT: POSTER ─────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, rotate: -3, y: 30 }}
              animate={{ opacity: imgLoaded ? 1 : 0, rotate: -2, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{
                width: isMobile ? 140 : "clamp(180px, 18vw, 260px)",
                margin: isMobile ? "0 auto" : undefined,
                flexShrink: 0,
              }}
            >
              <div style={{
                aspectRatio: "2/3", borderRadius: 14, overflow: "hidden",
                boxShadow: `0 40px 100px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.07), 0 0 60px rgba(${accentRgb},0.2)`,
                position: "relative",
              }}>
                <img
                  src={movie.posterImage || anime.coverImage || anime.cover}
                  alt={movieTitle}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {/* Score on poster */}
                {movie.score && (
                  <div style={{
                    position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)",
                    borderRadius: 8, padding: "5px 8px", border: "1px solid rgba(251,191,36,0.3)",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ color: "#fbbf24", fontSize: 11 }}>✦</span>
                    <span style={{ color: "#fde68a", fontSize: 13, fontWeight: 800 }}>{movie.score.toFixed(1)}</span>
                  </div>
                )}
                {/* Accent glow strip at bottom of poster */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(to right, transparent, ${accent}, transparent)` }} />
              </div>
            </motion.div>

            {/* ── RIGHT: INFO ──────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.7 }}
              style={{ textAlign: isMobile ? "center" : "left" }}
            >
              {/* Badges row */}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 18, justifyContent: isMobile ? "center" : "flex-start" }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" as const,
                  padding: "4px 12px", borderRadius: 5,
                  background: `rgba(${accentRgb},0.14)`, border: `1px solid rgba(${accentRgb},0.4)`, color: accent,
                }}>🎬 Longa-metragem</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}>{movie.year}</span>
                {movie.runtime && <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}>⏱ {formatRuntime(movie.runtime)}</span>}
                {movie.ageRating && <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 5, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>{movie.ageRating}</span>}
              </div>

              {/* Anime name */}
              <p style={{ fontSize: isMobile ? 12 : 14, color: `rgba(${accentRgb},0.7)`, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6 }}>
                {anime.title} · {anime.titleJapanese}
              </p>

              {/* Movie title */}
              <h1 style={{
                fontSize: isMobile ? "clamp(28px, 8vw, 44px)" : "clamp(38px, 5.5vw, 76px)",
                fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.035em", color: "#fff",
                marginBottom: 10,
                textShadow: `0 0 80px rgba(${accentRgb},0.25)`,
              }}>
                {movieTitle}
              </h1>

              {/* Tagline */}
              {tagline && (
                <p style={{
                  fontSize: isMobile ? 15 : 18, color: `rgba(${accentRgb},0.65)`,
                  fontStyle: "italic", fontWeight: 400, marginBottom: 18, letterSpacing: "0.01em",
                }}>
                  "{tagline}"
                </p>
              )}

              {/* Director */}
              {movie.director && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
                  <span style={{ color: "rgba(255,255,255,0.22)", marginRight: 8, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Direção</span>
                  <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{movie.director}</span>
                </p>
              )}

              {/* Awards */}
              {awards.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginBottom: 24, justifyContent: isMobile ? "center" : "flex-start" }}>
                  {awards.map((aw, i) => (
                    <span key={i} style={{
                      fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
                      background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", color: "#fde68a",
                      display: "flex", alignItems: "center", gap: 5,
                    }}>
                      🏆 {aw}
                    </span>
                  ))}
                </div>
              )}

              {/* CTA row */}
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, alignItems: "center", justifyContent: isMobile ? "center" : "flex-start" }}>
                {/* Watch now */}
                <motion.button
                  onClick={() => setShowPlayer(p => !p)}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "13px 28px", borderRadius: 12, border: "none",
                    background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                    color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer",
                    boxShadow: `0 8px 32px rgba(${accentRgb},0.5), 0 0 0 1px rgba(${accentRgb},0.3)`,
                    letterSpacing: "-0.01em",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,4 20,12 7,20" /></svg>
                  {showPlayer ? "Fechar player" : "Assistir agora"}
                </motion.button>

                {/* Audio */}
                <AudioToggle audio={audio} onChange={setAudio} audios={movie.audios} accentRgb={accentRgb} />

                {/* Trailer */}
                {ytId && (
                  <button onClick={() => setShowTrailer(p => !p)} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 12, border: "none",
                    background: showTrailer ? `rgba(${accentRgb},0.12)` : "rgba(255,255,255,0.06)",
                    color: showTrailer ? accent : "rgba(255,255,255,0.6)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    outline: showTrailer ? `1px solid rgba(${accentRgb},0.35)` : "1px solid rgba(255,255,255,0.1)",
                    transition: "all 0.2s",
                  }}>
                    {showTrailer ? "✕" : "▷"} Trailer
                  </button>
                )}

                <WatchlistButton animeId={anime.id} compact />

                {/* Watched */}
                {movieEp && (
                  <button
                    onClick={() => watched ? unmarkEpisode(anime.id, movieEp.id) : markEpisode(anime.id, movieEp.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "11px 16px", borderRadius: 12, border: "none",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.18s",
                      background: watched ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)",
                      color: watched ? "#4ade80" : "rgba(255,255,255,0.45)",
                      outline: watched ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {watched ? "✓ Assistido" : "Marcar visto"}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── TRAILER ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showTrailer && ytId && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ padding: "0 clamp(16px, 5vw, 72px) 8px" }}>
                <div style={{ position: "relative", paddingBottom: "56.25%", borderRadius: 14, overflow: "hidden", maxWidth: 920, boxShadow: `0 24px 80px rgba(${accentRgb},0.2), 0 0 0 1px rgba(${accentRgb},0.15)` }}>
                  <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`}
                    title="Trailer" allow="autoplay; encrypted-media" allowFullScreen
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── PLAYER ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showPlayer && embedSrc && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ padding: "16px clamp(16px, 5vw, 72px) 8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, padding: "4px 10px", borderRadius: 5, background: `rgba(${accentRgb},0.12)`, border: `1px solid rgba(${accentRgb},0.3)`, color: accent }}>▶ REPRODUZINDO</span>
                  <AudioToggle audio={audio} onChange={setAudio} audios={movie.audios} accentRgb={accentRgb} />
                </div>
                <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: `0 24px 80px rgba(${accentRgb},0.15), 0 0 0 1px rgba(255,255,255,0.05)` }}>
                  <EpisodePlayer episode={{ ...movieEp, embedUrl: embedSrc }} animeTitle={movieTitle} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── STATS ROW ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          style={{ padding: "24px clamp(16px, 5vw, 72px)", display: "flex", flexWrap: "wrap" as const, gap: 10 }}
        >
          {movie.score && <StatPill icon="✦" label="Nota MAL" value={`${movie.score.toFixed(2)} / 10`} accentRgb={accentRgb} />}
          {movie.runtime && <StatPill icon="⏱" label="Duração" value={formatRuntime(movie.runtime)} accentRgb={accentRgb} />}
          <StatPill icon="📅" label="Lançamento" value={String(movie.year)} accentRgb={accentRgb} />
          {movie.ageRating && <StatPill icon="🔞" label="Classificação" value={movie.ageRating} accentRgb={accentRgb} />}
          <StatPill icon="🎬" label="Estúdio" value={anime.studio} accentRgb={accentRgb} />
          {movie.director && <StatPill icon="🎥" label="Direção" value={movie.director} accentRgb={accentRgb} />}
        </motion.div>

        {/* ── FILM STRIP (divider) ─────────────────────────────────────── */}
        <FilmStrip accent={accent} accentRgb={accentRgb} />

        {/* ── STILLS GALLERY ───────────────────────────────────────────── */}
        {stills.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
          >
            <div style={{ padding: "32px clamp(16px, 5vw, 72px) 16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
                <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: `rgba(${accentRgb},0.6)` }}>
                  Galeria de cenas
                </h2>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{stills.length} imagens · clique para ampliar</span>
              </div>
            </div>
            <FilmstripGallery stills={stills} accent={accent} accentRgb={accentRgb} />
          </motion.div>
        )}

        {/* ── FILM STRIP (divider) ─────────────────────────────────────── */}
        <FilmStrip accent={accent} accentRgb={accentRgb} />

        {/* ── SYNOPSIS + FICHA ─────────────────────────────────────────── */}
        <div style={{
          padding: "40px clamp(16px, 5vw, 72px)",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr clamp(240px, 30%, 360px)",
          gap: isMobile ? 32 : "40px 60px",
        }}>
          {/* Synopsis */}
          <div>
            <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: `rgba(${accentRgb},0.6)`, marginBottom: 16 }}>
              Sinopse
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.9, color: "rgba(255,255,255,0.68)", maxWidth: 640 }}>
              {movie.synopsis}
            </p>

            {/* Genre chips */}
            {anime.genre?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6, marginTop: 22 }}>
                {anime.genre.map((g: string) => (
                  <span key={g} style={{
                    fontSize: 11, fontWeight: 600, padding: "4px 11px", borderRadius: 6,
                    background: `rgba(${accentRgb},0.08)`, border: `1px solid rgba(${accentRgb},0.2)`,
                    color: `rgba(${accentRgb},0.9)`,
                  }}>
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Ficha técnica */}
          <motion.div
            initial={{ opacity: 0, x: isMobile ? 0 : 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}
            style={{
              background: `rgba(${accentRgb},0.04)`,
              border: `1px solid rgba(${accentRgb},0.15)`,
              borderRadius: 16, padding: "24px", alignSelf: "start",
              boxShadow: `0 0 40px rgba(${accentRgb},0.06) inset`,
            }}
          >
            <h3 style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: `rgba(${accentRgb},0.6)`, marginBottom: 20 }}>
              Ficha técnica
            </h3>
            {[
              { l: "Título original", v: anime.titleJapanese },
              { l: "Direção", v: movie.director },
              { l: "Estúdio", v: anime.studio },
              { l: "Ano", v: String(movie.year) },
              { l: "Duração", v: movie.runtime ? formatRuntime(movie.runtime) : null },
              { l: "Classificação", v: movie.ageRating },
              { l: "Nota MyAnimeList", v: movie.score ? `${movie.score.toFixed(2)} / 10` : null },
            ].filter(r => r.v).map(row => (
              <div key={row.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>{row.l}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.78)", textAlign: "right" }}>{row.v}</span>
              </div>
            ))}

            {/* Awards in ficha */}
            {awards.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: `rgba(${accentRgb},0.5)`, marginBottom: 10 }}>Prêmios</p>
                {awards.map((aw, i) => (
                  <p key={i} style={{ fontSize: 11, color: "#fde68a", padding: "4px 0", display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.4 }}>
                    <span style={{ flexShrink: 0 }}>🏆</span> {aw}
                  </p>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── CAST SECTION ─────────────────────────────────────────────── */}
        {cast.length > 0 && (
          <div style={{ padding: "0 clamp(16px, 5vw, 72px) 48px" }}>
            {/* Section header with accent line */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ width: 3, height: 22, borderRadius: 2, background: accent }} />
              <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: `rgba(${accentRgb},0.7)` }}>
                Elenco de vozes
              </h2>
              <AudioToggle audio={audio} onChange={setAudio} audios={movie.audios} accentRgb={accentRgb} />
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 160}px, 1fr))`,
              gap: 10,
            }}>
              {cast.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 + i * 0.05 }}>
                  <CastCard member={m} accentRgb={accentRgb} audio={audio} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── BOTTOM FILM STRIP (animated) ─────────────────────────────── */}
        <FilmStrip accent={accent} accentRgb={accentRgb} scroll />

        {/* ── FOOTER CTA ───────────────────────────────────────────────── */}
        <div style={{
          padding: "56px clamp(16px, 5vw, 72px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", gap: 16,
          background: `linear-gradient(to bottom, transparent, rgba(${accentRgb},0.04))`,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: `rgba(${accentRgb},0.5)` }}>
            Pronto para assistir?
          </p>
          <h2 style={{ fontSize: isMobile ? 28 : 42, fontWeight: 900, letterSpacing: "-0.03em", color: "#fff", lineHeight: 1 }}>
            {movieTitle}
          </h2>
          <motion.button
            onClick={() => { setShowPlayer(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "15px 40px", borderRadius: 14, border: "none",
              background: `linear-gradient(135deg, ${accent}, ${accent}bb)`,
              color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer",
              boxShadow: `0 12px 40px rgba(${accentRgb},0.5)`,
              marginTop: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,4 20,12 7,20" /></svg>
            Assistir agora
          </motion.button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  );
}