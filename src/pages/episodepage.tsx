// src/pages/EpisodePage.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAnime } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import { useEpisodeHistory } from "../hooks/useepisodehistory";
import EpisodePlayer from "../components/episodeplayer";
import WatchlistButton from "../components/watchlistbutton";
import PageLoader from "../components/pageloader";

// ── Types ─────────────────────────────────────────────────────────────────────

type AudioType = "sub" | "dub";

// ── Helpers ───────────────────────────────────────────────────────────────────

function padEp(n: number) {
  return String(n).padStart(2, "0");
}

/** Extract all seasons from flat episodes array */
function groupBySeason(episodes: any[]): Record<number, any[]> {
  return episodes.reduce((acc, ep) => {
    const s = ep.season ?? 1;
    if (!acc[s]) acc[s] = [];
    acc[s].push(ep);
    return acc;
  }, {} as Record<number, any[]>);
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Audio toggle pill — LEG / DUB */
function AudioToggle({ audio, onChange, hasAlt }: {
  audio: AudioType;
  onChange: (a: AudioType) => void;
  hasAlt: boolean;
}) {
  if (!hasAlt) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: 3, gap: 2,
    }}>
      {(["sub", "dub"] as AudioType[]).map(type => {
        const active = audio === type;
        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            style={{
              padding: "5px 13px", borderRadius: 6, border: "none",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", cursor: "pointer",
              transition: "all 0.18s",
              background: active ? "#dc2626" : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.4)",
              boxShadow: active ? "0 2px 10px rgba(220,38,38,0.4)" : "none",
            }}
          >
            {type === "sub" ? "LEG" : "DUB"}
          </button>
        );
      })}
    </div>
  );
}

/** Season tab bar */
function SeasonTabs({ seasons, active, onSelect, watchedBySeasonMap, episodesBySeasonMap }: {
  seasons: number[];
  active: number;
  onSelect: (s: number) => void;
  watchedBySeasonMap: Record<number, number>;
  episodesBySeasonMap: Record<number, any[]>;
}) {
  if (seasons.length <= 1) return null;
  return (
    <div style={{
      display: "flex", gap: 4, padding: "10px 12px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      overflowX: "auto",
    }}>
      {seasons.map(s => {
        const isActive = active === s;
        const total    = episodesBySeasonMap[s]?.length ?? 0;
        const watched  = watchedBySeasonMap[s] ?? 0;
        const pct      = total > 0 ? Math.round((watched / total) * 100) : 0;
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            style={{
              flexShrink: 0, padding: "7px 14px 9px",
              background: "none", border: "none", cursor: "pointer",
              position: "relative", transition: "color 0.15s",
              color: isActive ? "#fff" : "rgba(255,255,255,0.38)",
              fontSize: 12, fontWeight: isActive ? 700 : 500,
            }}
          >
            <span>T{s}</span>
            {pct > 0 && pct < 100 && (
              <span style={{
                marginLeft: 5, fontSize: 9, fontWeight: 700,
                color: "#dc2626", opacity: 0.8,
              }}>
                {pct}%
              </span>
            )}
            {pct === 100 && (
              <span style={{ marginLeft: 5, fontSize: 9, color: "#4ade80" }}>✓</span>
            )}
            {/* Active underline */}
            {isActive && (
              <motion.div
                layoutId="season-tab-indicator"
                style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: 2, background: "#dc2626", borderRadius: "2px 2px 0 0",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Single episode row in sidebar */
function EpisodeRow({ ep, isCurrent, isWatched, onClick }: {
  ep: any; isCurrent: boolean; isWatched: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const rowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isCurrent && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isCurrent]);

  return (
    <button
      ref={rowRef}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", border: "none", textAlign: "left",
        cursor: "pointer", transition: "background 0.13s",
        borderLeft: isCurrent ? "2px solid #dc2626" : "2px solid transparent",
        background: isCurrent
          ? "rgba(220,38,38,0.1)"
          : hov
          ? "rgba(255,255,255,0.04)"
          : isWatched
          ? "rgba(74,222,128,0.03)"
          : "transparent",
        position: "relative",
      }}
    >
      {/* Status dot / number */}
      <div style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isCurrent
          ? "rgba(220,38,38,0.2)"
          : isWatched
          ? "rgba(74,222,128,0.1)"
          : "rgba(255,255,255,0.06)",
        fontSize: 11, fontWeight: 700,
        color: isCurrent ? "#fca5a5" : isWatched ? "#4ade80" : "rgba(255,255,255,0.4)",
      }}>
        {isCurrent ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="7,4 20,12 7,20" />
          </svg>
        ) : isWatched ? "✓" : padEp(ep.number)}
      </div>

      {/* Title + credit */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 12, fontWeight: isCurrent ? 600 : 500, lineHeight: 1.3,
          color: isCurrent ? "#fff" : isWatched ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.8)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {ep.title}
        </p>
        {ep.embedCredit && (
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", marginTop: 1 }}>
            {ep.embedCredit}
          </p>
        )}
      </div>

      {/* Duration */}
      {ep.duration && !isCurrent && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
          {ep.duration}m
        </span>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function EpisodePage() {
  const { id, epId } = useParams<{ id: string; epId: string }>();
  const { anime, loading } = useAnime(decodeURIComponent(id!));
  const { markEpisode, isWatched, unmarkEpisode } = useWatched();
  const { addToHistory } = useEpisodeHistory();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [cinemaMode,  setCinemaMode]  = useState(false);
  const [epSearch,    setEpSearch]    = useState("");
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Derived state ──────────────────────────────────────────────────────────

  const requestedAudio = useMemo<AudioType>(() => {
    try {
      const a = new URLSearchParams(location.search).get("audio");
      return (a === "dub" ? "dub" : "sub") as AudioType;
    } catch { return "sub"; }
  }, [location.search]);

  const episode = useMemo(() => anime?.episodes.find(e => e.id === epId), [anime, epId]);
  const epIdx   = useMemo(() => anime?.episodes.findIndex(e => e.id === epId) ?? -1, [anime, epId]);

  const bySeasonMap = useMemo(
    () => anime ? groupBySeason(anime.episodes) : {},
    [anime]
  );
  const seasons = useMemo(() => Object.keys(bySeasonMap).map(Number).sort((a, b) => a - b), [bySeasonMap]);

  // Set active season to current episode's season on load
  useEffect(() => {
    if (episode && (episode as any).season != null) {
      setActiveSeason((episode as any).season);
    } else if (seasons.length > 0) {
      setActiveSeason(seasons[0]);
    }
  }, [episode?.id]);

  const seasonEpisodes = useMemo(() => bySeasonMap[activeSeason] ?? [], [bySeasonMap, activeSeason]);

  const filteredEps = useMemo(() =>
    seasonEpisodes.filter(ep =>
      ep.title.toLowerCase().includes(epSearch.toLowerCase()) ||
      String(ep.number).includes(epSearch)
    ), [seasonEpisodes, epSearch]);

  // Check if alt audio is available for current episode
  const embedMap  = useMemo(() => (episode as any)?.embeds ?? {}, [episode]);
  const hasAltAudio = useMemo(() => {
    const altAudio: AudioType = requestedAudio === "sub" ? "dub" : "sub";
    return !!embedMap[altAudio];
  }, [embedMap, requestedAudio]);

  const embedSrc = useMemo(() => {
    if (!episode) return "";
    if ((episode as any).embedUrl) return (episode as any).embedUrl;
    return embedMap[requestedAudio] || embedMap.sub || embedMap.dub || "";
  }, [episode, embedMap, requestedAudio]);

  const prevEp = useMemo(() => epIdx > 0 ? anime?.episodes[epIdx - 1] : null, [anime, epIdx]);
  const nextEp = useMemo(() => anime && epIdx < anime.episodes.length - 1 ? anime.episodes[epIdx + 1] : null, [anime, epIdx]);

  const watchedBySeasonMap = useMemo(() => {
    if (!anime) return {};
    return seasons.reduce((acc, s) => {
      acc[s] = (bySeasonMap[s] ?? []).filter(ep => isWatched(anime.id, ep.id)).length;
      return acc;
    }, {} as Record<number, number>);
  }, [anime, seasons, bySeasonMap, isWatched, epId]);

  const watched = anime && episode ? isWatched(anime.id, episode.id) : false;
  const audioLabel = requestedAudio === "dub" ? "Dublado" : "Legendado";

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!anime || !episode) return;
    document.title = `${episode.title} — ${anime.title} | AnimeVerse`;
    const t = setTimeout(() => markEpisode(anime.id, episode.id), 30000);
    addToHistory({
      animeId: anime.id, animeTitle: anime.title, animeCover: anime.cover,
      epId: episode.id, epTitle: episode.title, epNumber: episode.number,
      audio: requestedAudio, watchedAt: Date.now(),
    });
    return () => clearTimeout(t);
  }, [anime?.id, episode?.id]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const navTo = useCallback((ep: any, audio?: AudioType) => {
    if (!ep || !anime) return;
    const a = audio ?? requestedAudio;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}?audio=${a}`);
  }, [anime, requestedAudio, navigate]);

  const switchAudio = useCallback((newAudio: AudioType) => {
    if (!episode || !anime) return;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${episode.id}?audio=${newAudio}`, { replace: true });
  }, [anime, episode, navigate]);

  // Keyboard shortcuts
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowLeft"  && prevEp) navTo(prevEp);
    if (e.key === "ArrowRight" && nextEp) navTo(nextEp);
    if (e.key === "c" || e.key === "C") setCinemaMode(v => !v);
    if (e.key === "Escape") setCinemaMode(false);
    if (e.key === "d" || e.key === "D") switchAudio(requestedAudio === "sub" ? "dub" : "sub");
  }, [prevEp, nextEp, navTo, switchAudio, requestedAudio]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── Render guards ──────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;
  if (!anime || !episode) return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 16,
      background: "#0a0a0a", color: "#fff",
    }}>
      <p style={{ color: "#f87171", fontSize: 18 }}>Episódio não encontrado.</p>
      <Link to={`/anime/${id}`} style={{
        padding: "8px 18px", borderRadius: 8, background: "#dc2626",
        color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none",
      }}>← Voltar ao anime</Link>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Cinema backdrop */}
      <AnimatePresence>
        {cinemaMode && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCinemaMode(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.92)", zIndex: 40,
              cursor: "pointer",
            }}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          maxWidth: 1440, margin: "0 auto",
          padding: "64px 16px 40px",
          position: "relative",
          zIndex: cinemaMode ? 50 : "auto",
        }}
      >

        {/* ── BREADCRUMB ──────────────────────────────────────────────────── */}
        <motion.nav
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}
        >
          {[
            { to: "/", label: "Início" },
            { to: `/anime/${encodeURIComponent(anime.id)}`, label: anime.title, truncate: true },
          ].map((crumb, i) => (
            <span key={crumb.to} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>/</span>}
              <Link to={crumb.to} style={{
                fontSize: 12, color: "rgba(255,255,255,0.38)",
                textDecoration: "none", transition: "color 0.15s",
                maxWidth: crumb.truncate ? 180 : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                display: "block",
              }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fca5a5")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.38)")}
              >
                {crumb.label}
              </Link>
            </span>
          ))}
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 12 }}>/</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
            Ep. {episode.number} · {audioLabel}
          </span>
        </motion.nav>

        {/* ── MAIN LAYOUT ─────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 20, alignItems: "flex-start",
          flexDirection: "row",
        }}>

          {/* ── LEFT: PLAYER + CONTROLS ─────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Episode header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "flex-start",
                justifyContent: "space-between", gap: 12, marginBottom: 14,
              }}
            >
              {/* Left: title block */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  {/* Episode number badge */}
                  <span style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.1em",
                    padding: "3px 9px", borderRadius: 6,
                    background: "rgba(220,38,38,0.15)",
                    border: "1px solid rgba(220,38,38,0.35)",
                    color: "#fca5a5",
                  }}>
                    EP {padEp(episode.number)}
                  </span>

                  {/* Audio toggle */}
                  <AudioToggle
                    audio={requestedAudio}
                    onChange={switchAudio}
                    hasAlt={hasAltAudio}
                  />

                  {/* Watched toggle */}
                  <button
                    onClick={() => watched
                      ? unmarkEpisode(anime.id, episode.id)
                      : markEpisode(anime.id, episode.id)
                    }
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 7, border: "none",
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      transition: "all 0.18s",
                      background: watched ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                      color: watched ? "#4ade80" : "rgba(255,255,255,0.45)",
                      outline: watched ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {watched ? "✓ Assistido" : "Marcar visto"}
                  </button>
                </div>
                <h1 style={{
                  fontSize: "clamp(18px, 2.8vw, 26px)", fontWeight: 800,
                  color: "#fff", lineHeight: 1.15, letterSpacing: "-0.02em",
                  marginBottom: 3,
                }}>
                  {episode.title}
                </h1>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>{anime.title}</p>
              </div>

              {/* Right: action buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <WatchlistButton animeId={anime.id} compact />

                {/* Cinema mode */}
                <button
                  onClick={() => setCinemaMode(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 13px", borderRadius: 8, border: "none",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.18s",
                    background: cinemaMode ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.05)",
                    color: cinemaMode ? "#fca5a5" : "rgba(255,255,255,0.5)",
                    outline: cinemaMode ? "1px solid rgba(220,38,38,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <span style={{ fontSize: 14 }}>⬛</span>
                  {cinemaMode ? "Sair" : "Cinema"}
                </button>

                {/* Sidebar toggle */}
                <button
                  onClick={() => setSidebarOpen(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 13px", borderRadius: 8, border: "none",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.18s",
                    background: sidebarOpen ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.45)",
                    outline: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M15 3v18" />
                  </svg>
                  Episódios
                </button>
              </div>
            </motion.div>

            {/* ── PLAYER ────────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              style={{
                borderRadius: 14, overflow: "hidden",
                boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
                background: "#000",
              }}
            >
              <EpisodePlayer episode={{ ...episode, embedUrl: embedSrc }} animeTitle={anime.title} />
            </motion.div>

            {/* Keyboard hint */}
            <p style={{
              textAlign: "center", marginTop: 10,
              fontSize: 11, color: "rgba(255,255,255,0.18)",
              letterSpacing: "0.03em",
            }}>
              ← → trocar episódio &nbsp;·&nbsp; C = cinema &nbsp;·&nbsp; D = áudio
            </p>

            {/* ── PREV / NEXT NAV ───────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              style={{
                display: "flex", gap: 10, marginTop: 18, alignItems: "stretch",
              }}
            >
              {/* Prev */}
              {prevEp ? (
                <button
                  onClick={() => navTo(prevEp)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 16px", borderRadius: 11,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer", transition: "all 0.18s",
                    color: "#fff",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Anterior</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
                      Ep. {padEp(prevEp.number)} — {prevEp.title}
                    </p>
                  </div>
                </button>
              ) : <div style={{ flex: 1 }} />}

              {/* Home list button */}
              <Link
                to={`/anime/${encodeURIComponent(anime.id)}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 44, flexShrink: 0, borderRadius: 11,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.45)", textDecoration: "none",
                  transition: "all 0.18s",
                }}
                title="Ver página do anime"
                onMouseEnter={e => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.45)";
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </Link>

              {/* Next */}
              {nextEp ? (
                <button
                  onClick={() => navTo(nextEp)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10,
                    padding: "12px 16px", borderRadius: 11,
                    background: "rgba(220,38,38,0.1)",
                    border: "1px solid rgba(220,38,38,0.3)",
                    cursor: "pointer", transition: "all 0.18s",
                    color: "#fff",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(220,38,38,0.18)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(220,38,38,0.5)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(220,38,38,0.1)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(220,38,38,0.3)";
                  }}
                >
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 10, color: "rgba(252,165,165,0.6)", marginBottom: 2 }}>Próximo</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}>
                      Ep. {padEp(nextEp.number)} — {nextEp.title}
                    </p>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(252,165,165,0.7)" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 11, background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 12, color: "rgba(255,255,255,0.25)",
                }}>
                  Último disponível
                </div>
              )}
            </motion.div>
          </div>

          {/* ── RIGHT: EPISODE SIDEBAR ────────────────────────────────────── */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.aside
                key="sidebar"
                initial={{ opacity: 0, x: 24, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 308 }}
                exit={{ opacity: 0, x: 24, width: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{
                  flexShrink: 0, overflow: "hidden",
                  background: "#0e0e12",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  display: "flex", flexDirection: "column",
                  maxHeight: "calc(100vh - 100px)",
                  position: "sticky", top: 20,
                }}
              >
                {/* Sidebar header */}
                <div style={{
                  padding: "14px 14px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <h2 style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                        Episódios
                      </h2>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                        {anime.episodes.length} no total · {audioLabel}
                      </p>
                    </div>

                    {/* Audio toggle in sidebar */}
                    <AudioToggle
                      audio={requestedAudio}
                      onChange={switchAudio}
                      hasAlt={hasAltAudio}
                    />
                  </div>

                  {/* Season tabs */}
                  <SeasonTabs
                    seasons={seasons}
                    active={activeSeason}
                    onSelect={s => { setActiveSeason(s); setEpSearch(""); }}
                    watchedBySeasonMap={watchedBySeasonMap}
                    episodesBySeasonMap={bySeasonMap}
                  />
                </div>

                {/* Search */}
                <div style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  flexShrink: 0,
                }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={epSearch}
                      onChange={e => setEpSearch(e.target.value)}
                      placeholder="Buscar episódio…"
                      style={{
                        width: "100%", height: 32,
                        padding: "0 32px 0 10px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 7, color: "#fff",
                        fontSize: 12, outline: "none",
                        boxSizing: "border-box",
                        transition: "border-color 0.15s",
                      }}
                      onFocus={e => (e.target.style.borderColor = "rgba(220,38,38,0.4)")}
                      onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
                    />
                    <span style={{
                      position: "absolute", right: 10, top: "50%",
                      transform: "translateY(-50%)",
                      color: "rgba(255,255,255,0.25)", fontSize: 14, pointerEvents: "none",
                    }}>⌕</span>
                  </div>
                </div>

                {/* Season progress bar */}
                {(() => {
                  const total   = seasonEpisodes.length;
                  const wCount  = watchedBySeasonMap[activeSeason] ?? 0;
                  const pct     = total > 0 ? Math.round((wCount / total) * 100) : 0;
                  if (pct === 0) return null;
                  return (
                    <div style={{
                      padding: "6px 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      flexShrink: 0,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                          Temporada {activeSeason}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: pct >= 100 ? "#4ade80" : "#fca5a5",
                        }}>
                          {wCount}/{total}
                        </span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          style={{
                            height: "100%", borderRadius: 3,
                            background: pct >= 100
                              ? "linear-gradient(90deg,#22c55e,#4ade80)"
                              : "linear-gradient(90deg,#dc2626,#ef4444)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Episode list */}
                <div style={{
                  overflowY: "auto", flex: 1,
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(255,255,255,0.1) transparent",
                }}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${activeSeason}-${epSearch}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      {filteredEps.length === 0 ? (
                        <p style={{
                          textAlign: "center", padding: "24px 16px",
                          fontSize: 12, color: "rgba(255,255,255,0.2)",
                        }}>
                          Nenhum resultado
                        </p>
                      ) : (
                        filteredEps.map(ep => (
                          <EpisodeRow
                            key={ep.id}
                            ep={ep}
                            isCurrent={ep.id === epId}
                            isWatched={!!anime && isWatched(anime.id, ep.id)}
                            onClick={() => navTo(ep)}
                          />
                        ))
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      `}</style>
    </>
  );
}