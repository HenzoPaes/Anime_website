// src/pages/EpisodePage.tsx
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
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

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useLayoutEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", update);
    update();
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isMobile;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function padEp(n: number) {
  return String(n).padStart(2, "0");
}

function groupBySeason(episodes: any[]): Record<number, any[]> {
  return episodes.reduce((acc, ep) => {
    const s = ep.season ?? 1;
    if (!acc[s]) acc[s] = [];
    acc[s].push(ep);
    return acc;
  }, {} as Record<number, any[]>);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AudioToggle({ audio, onChange, hasAlt }: {
  audio: AudioType; onChange: (a: AudioType) => void; hasAlt: boolean;
}) {
  if (!hasAlt) return null;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center",
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: 3, gap: 2, flexShrink: 0,
    }}>
      {(["sub", "dub"] as AudioType[]).map(type => {
        const active = audio === type;
        return (
          <button key={type} onClick={() => onChange(type)} style={{
            padding: "5px 13px", borderRadius: 6, border: "none",
            fontSize: 11, fontWeight: 800, letterSpacing: "0.08em",
            textTransform: "uppercase" as const, cursor: "pointer", transition: "all 0.18s",
            background: active ? "#dc2626" : "transparent",
            color: active ? "#fff" : "rgba(255,255,255,0.38)",
            boxShadow: active ? "0 2px 10px rgba(220,38,38,0.4)" : "none",
            whiteSpace: "nowrap" as const,
          }}>
            {type === "sub" ? "LEG" : "DUB"}
          </button>
        );
      })}
    </div>
  );
}

function SeasonTabs({ seasons, active, onSelect, watchedBySeasonMap, episodesBySeasonMap }: {
  seasons: number[]; active: number; onSelect: (s: number) => void;
  watchedBySeasonMap: Record<number, number>; episodesBySeasonMap: Record<number, any[]>;
}) {
  if (seasons.length <= 1) return null;
  return (
    <div style={{
      display: "flex", gap: 2, overflowX: "auto",
      padding: "8px 12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {seasons.map(s => {
        const isActive = active === s;
        const total = episodesBySeasonMap[s]?.length ?? 0;
        const watched = watchedBySeasonMap[s] ?? 0;
        const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
        return (
          <button key={s} onClick={() => onSelect(s)} style={{
            flexShrink: 0, padding: "6px 14px 9px",
            background: "none", border: "none", cursor: "pointer",
            position: "relative", transition: "color 0.15s",
            color: isActive ? "#fff" : "rgba(255,255,255,0.38)",
            fontSize: 13, fontWeight: isActive ? 700 : 500,
          }}>
            <span>T{s}</span>
            {pct > 0 && pct < 100 && (
              <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: "#dc2626" }}>{pct}%</span>
            )}
            {pct >= 100 && <span style={{ marginLeft: 4, fontSize: 9, color: "#4ade80" }}>✓</span>}
            {isActive && (
              <motion.div layoutId="season-tab"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#dc2626", borderRadius: "2px 2px 0 0" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function EpisodeRow({ ep, isCurrent, isWatched, onClick }: {
  ep: any; isCurrent: boolean; isWatched: boolean; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const rowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isCurrent && rowRef.current) rowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isCurrent]);

  return (
    <button ref={rowRef} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "11px 14px", border: "none", textAlign: "left", cursor: "pointer",
        transition: "background 0.13s", boxSizing: "border-box",
        borderLeft: isCurrent ? "2px solid #dc2626" : "2px solid transparent",
        background: isCurrent ? "rgba(220,38,38,0.1)" : hov ? "rgba(255,255,255,0.04)" : "transparent",
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isCurrent ? "rgba(220,38,38,0.2)" : isWatched ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.06)",
        fontSize: 11, fontWeight: 700,
        color: isCurrent ? "#fca5a5" : isWatched ? "#4ade80" : "rgba(255,255,255,0.4)",
      }}>
        {isCurrent
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="7,4 20,12 7,20" /></svg>
          : isWatched ? "✓" : padEp(ep.number)
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: isCurrent ? 600 : 500, lineHeight: 1.3,
          color: isCurrent ? "#fff" : isWatched ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.82)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {ep.title}
        </p>
        {ep.embedCredit && (
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>{ep.embedCredit}</p>
        )}
      </div>
      {ep.duration && !isCurrent && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>{ep.duration}m</span>
      )}
    </button>
  );
}

/** Shared panel used in both desktop sidebar and mobile bottom sheet */
function EpisodePanel({ anime, epId, epSearch, setEpSearch, filteredEps, seasons, activeSeason,
  setActiveSeason, watchedBySeasonMap, bySeasonMap, seasonEpisodes, requestedAudio,
  hasAltAudio, switchAudio, audioLabel, isWatched, navTo }: any) {
  const total  = seasonEpisodes.length;
  const wCount = watchedBySeasonMap[activeSeason] ?? 0;
  const pct    = total > 0 ? Math.round((wCount / total) * 100) : 0;

  return (
    <>
      <div style={{ padding: "12px 14px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>Episódios</h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              {anime.episodes.length} no total · {audioLabel}
            </p>
          </div>
          <AudioToggle audio={requestedAudio} onChange={switchAudio} hasAlt={hasAltAudio} />
        </div>
        <SeasonTabs seasons={seasons} active={activeSeason}
          onSelect={s => { setActiveSeason(s); setEpSearch(""); }}
          watchedBySeasonMap={watchedBySeasonMap} episodesBySeasonMap={bySeasonMap}
        />
      </div>

      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <input type="text" value={epSearch} onChange={e => setEpSearch(e.target.value)}
            placeholder="Buscar episódio…"
            style={{
              width: "100%", height: 34, padding: "0 32px 0 10px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => (e.target.style.borderColor = "rgba(220,38,38,0.4)")}
            onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
          />
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", fontSize: 14, pointerEvents: "none" }}>⌕</span>
        </div>
      </div>

      {pct > 0 && (
        <div style={{ padding: "7px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Temporada {activeSeason}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: pct >= 100 ? "#4ade80" : "#fca5a5" }}>{wCount}/{total}</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
              style={{ height: "100%", borderRadius: 3, background: pct >= 100 ? "linear-gradient(90deg,#22c55e,#4ade80)" : "linear-gradient(90deg,#dc2626,#ef4444)" }}
            />
          </div>
        </div>
      )}

      <div style={{ overflowY: "auto", flex: 1, scrollbarWidth: "thin" as const, scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        <AnimatePresence mode="wait">
          <motion.div key={`${activeSeason}-${epSearch}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            {filteredEps.length === 0
              ? <p style={{ textAlign: "center", padding: "24px 16px", fontSize: 12, color: "rgba(255,255,255,0.2)" }}>Nenhum resultado</p>
              : filteredEps.map((ep: any) => (
                <EpisodeRow key={ep.id} ep={ep} isCurrent={ep.id === epId}
                  isWatched={!!anime && isWatched(anime.id, ep.id)} onClick={() => navTo(ep)} />
              ))
            }
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EpisodePage() {
  const { id, epId } = useParams<{ id: string; epId: string }>();
  const { anime, loading } = useAnime(decodeURIComponent(id!));
  const { markEpisode, isWatched, unmarkEpisode } = useWatched();
  const { addToHistory } = useEpisodeHistory();
  const navigate  = useNavigate();
  const location  = useLocation();
  const isMobile  = useIsMobile();

  const [cinemaMode,   setCinemaMode]   = useState(false);
  const [epSearch,     setEpSearch]     = useState("");
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [sheetOpen,    setSheetOpen]    = useState(false);

  const requestedAudio = useMemo<AudioType>(() => {
    try { const a = new URLSearchParams(location.search).get("audio"); return a === "dub" ? "dub" : "sub"; }
    catch { return "sub"; }
  }, [location.search]);

  const episode = useMemo(() => anime?.episodes.find(e => e.id === epId), [anime, epId]);
  const epIdx   = useMemo(() => anime?.episodes.findIndex(e => e.id === epId) ?? -1, [anime, epId]);

  const bySeasonMap = useMemo(() => anime ? groupBySeason(anime.episodes) : {}, [anime]);
  const seasons     = useMemo(() => Object.keys(bySeasonMap).map(Number).sort((a, b) => a - b), [bySeasonMap]);

  useEffect(() => {
    if (episode && (episode as any).season != null) setActiveSeason((episode as any).season);
    else if (seasons.length > 0) setActiveSeason(seasons[0]);
  }, [episode?.id]);

  const seasonEpisodes = useMemo(() => bySeasonMap[activeSeason] ?? [], [bySeasonMap, activeSeason]);
  const filteredEps    = useMemo(() =>
    seasonEpisodes.filter(ep =>
      ep.title.toLowerCase().includes(epSearch.toLowerCase()) || String(ep.number).includes(epSearch)
    ), [seasonEpisodes, epSearch]);

  const embedMap    = useMemo(() => (episode as any)?.embeds ?? {}, [episode]);
  const hasAltAudio = useMemo(() => !!embedMap[requestedAudio === "sub" ? "dub" : "sub"], [embedMap, requestedAudio]);
  const embedSrc    = useMemo(() => {
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

  const watched    = anime && episode ? isWatched(anime.id, episode.id) : false;
  const audioLabel = requestedAudio === "dub" ? "Dublado" : "Legendado";

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

  useEffect(() => { setSheetOpen(false); }, [epId]);

  const navTo = useCallback((ep: any, audio?: AudioType) => {
    if (!ep || !anime) return;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}?audio=${audio ?? requestedAudio}`);
  }, [anime, requestedAudio, navigate]);

  const switchAudio = useCallback((newAudio: AudioType) => {
    if (!episode || !anime) return;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${episode.id}?audio=${newAudio}`, { replace: true });
  }, [anime, episode, navigate]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowLeft"  && prevEp) navTo(prevEp);
    if (e.key === "ArrowRight" && nextEp) navTo(nextEp);
    if (e.key === "c" || e.key === "C") setCinemaMode(v => !v);
    if (e.key === "Escape") { setCinemaMode(false); setSheetOpen(false); }
    if (e.key === "d" || e.key === "D") switchAudio(requestedAudio === "sub" ? "dub" : "sub");
  }, [prevEp, nextEp, navTo, switchAudio, requestedAudio]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (loading) return <PageLoader />;
  if (!anime || !episode) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, background: "#0a0a0a" }}>
      <p style={{ color: "#f87171", fontSize: 18 }}>Episódio não encontrado.</p>
      <Link to={`/anime/${id}`} style={{ padding: "8px 18px", borderRadius: 8, background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
        ← Voltar
      </Link>
    </div>
  );

  const panelProps = {
    anime, epId, epSearch, setEpSearch, filteredEps, seasons, activeSeason,
    setActiveSeason, watchedBySeasonMap, bySeasonMap, seasonEpisodes,
    requestedAudio, hasAltAudio, switchAudio, audioLabel, isWatched, navTo,
  };

  return (
    <>
      {/* Cinema backdrop */}
      <AnimatePresence>
        {cinemaMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCinemaMode(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 40, cursor: "pointer" }}
          />
        )}
      </AnimatePresence>

      {/* Mobile sheet backdrop */}
      <AnimatePresence>
        {isMobile && sheetOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 60, backdropFilter: "blur(4px)" }}
          />
        )}
      </AnimatePresence>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {isMobile && sheetOpen && (
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 35 }}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
              background: "#0e0e12", borderRadius: "18px 18px 0 0",
              border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none",
              display: "flex", flexDirection: "column", height: "78vh",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.7)",
            }}
          >
            {/* Drag handle + close */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px 0", flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>
            <button onClick={() => setSheetOpen(false)} style={{
              position: "absolute", top: 10, right: 14,
              background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8,
              color: "rgba(255,255,255,0.5)", width: 30, height: 30, cursor: "pointer",
              fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
            <EpisodePanel {...panelProps} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        style={{
          maxWidth: 1440, margin: "0 auto",
          padding: isMobile ? "56px 12px 100px" : "64px 24px 40px",
          position: "relative", zIndex: cinemaMode ? 50 : "auto",
        }}
      >
        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 16, flexWrap: "wrap" as const }}>
          {[
            { to: "/",                                        label: "Início"      },
            { to: `/anime/${encodeURIComponent(anime.id)}`,  label: anime.title, truncate: true },
          ].map((c, i) => (
            <span key={c.to} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>/</span>}
              <Link to={c.to} style={{
                fontSize: 12, color: "rgba(255,255,255,0.35)", textDecoration: "none",
                maxWidth: (c as any).truncate ? (isMobile ? 110 : 200) : "none",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, display: "block",
              }}>
                {c.label}
              </Link>
            </span>
          ))}
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 11 }}>/</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>
            Ep. {episode.number} · {audioLabel}
          </span>
        </nav>

        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

          {/* Player column */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Episode header */}
            <div style={{ marginBottom: 12 }}>
              {/* Badges row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" as const }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", padding: "4px 10px", borderRadius: 6,
                    background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)", color: "#fca5a5", flexShrink: 0,
                  }}>
                    EP {padEp(episode.number)}
                  </span>
                  <AudioToggle audio={requestedAudio} onChange={switchAudio} hasAlt={hasAltAudio} />
                  <button
                    onClick={() => watched ? unmarkEpisode(anime.id, episode.id) : markEpisode(anime.id, episode.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 7, border: "none",
                      fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0, transition: "all 0.18s",
                      background: watched ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                      color: watched ? "#4ade80" : "rgba(255,255,255,0.45)",
                      outline: watched ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {watched ? "✓ Assistido" : "Marcar visto"}
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <WatchlistButton animeId={anime.id} compact />
                  {!isMobile && (
                    <>
                      <button onClick={() => setCinemaMode(v => !v)} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: cinemaMode ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.05)",
                        color: cinemaMode ? "#fca5a5" : "rgba(255,255,255,0.45)",
                        outline: cinemaMode ? "1px solid rgba(220,38,38,0.3)" : "1px solid rgba(255,255,255,0.08)",
                      }}>
                        ⬛ {cinemaMode ? "Sair" : "Cinema"}
                      </button>
                      <button onClick={() => setSidebarOpen(v => !v)} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "none",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.45)",
                        outline: "1px solid rgba(255,255,255,0.08)",
                      }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />
                        </svg>
                        Episódios
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h1 style={{
                fontSize: isMobile ? 18 : "clamp(18px, 2.4vw, 26px)",
                fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: 3,
              }}>
                {episode.title}
              </h1>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)" }}>{anime.title}</p>
            </div>

            {/* Player */}
            <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.35 }}
              style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 70px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)", background: "#000" }}
            >
              <EpisodePlayer episode={{ ...episode, embedUrl: embedSrc }} animeTitle={anime.title} />
            </motion.div>

            {!isMobile && (
              <p style={{ textAlign: "center", marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.16)", letterSpacing: "0.03em" }}>
                ← → trocar episódio &nbsp;·&nbsp; C = cinema &nbsp;·&nbsp; D = áudio
              </p>
            )}

            {/* Prev / Next */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "stretch" }}>
              {prevEp ? (
                <button onClick={() => navTo(prevEp)} style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 11,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: "#fff",
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <div style={{ textAlign: "left", overflow: "hidden" }}>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginBottom: 1 }}>Anterior</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Ep. {padEp(prevEp.number)}{!isMobile && ` — ${prevEp.title}`}
                    </p>
                  </div>
                </button>
              ) : <div style={{ flex: 1 }} />}

              <Link to={`/anime/${encodeURIComponent(anime.id)}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 42, flexShrink: 0, borderRadius: 11,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.4)", textDecoration: "none",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </Link>

              {nextEp ? (
                <button onClick={() => navTo(nextEp)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 14px", borderRadius: 11,
                  background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.28)", cursor: "pointer", color: "#fff",
                }}>
                  <div style={{ textAlign: "right", overflow: "hidden" }}>
                    <p style={{ fontSize: 10, color: "rgba(252,165,165,0.55)", marginBottom: 1 }}>Próximo</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#fca5a5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Ep. {padEp(nextEp.number)}{!isMobile && ` — ${nextEp.title}`}
                    </p>
                  </div>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(252,165,165,0.6)" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 11, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 12, color: "rgba(255,255,255,0.2)",
                }}>
                  Último disponível
                </div>
              )}
            </div>
          </div>

          {/* Desktop sidebar */}
          <AnimatePresence>
            {!isMobile && sidebarOpen && (
              <motion.aside
                key="sidebar"
                initial={{ opacity: 0, x: 20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 300 }}
                exit={{ opacity: 0, x: 20, width: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{
                  flexShrink: 0, overflow: "hidden",
                  background: "#0e0e12", border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, display: "flex", flexDirection: "column",
                  maxHeight: "calc(100vh - 100px)", position: "sticky", top: 20,
                }}
              >
                <EpisodePanel {...panelProps} />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Mobile sticky bottom bar */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
          background: "rgba(10,10,10,0.97)", backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
          display: "flex", gap: 8,
        }}>
          <button onClick={() => setSheetOpen(true)} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px", borderRadius: 12, border: "none",
            background: "rgba(255,255,255,0.07)", color: "#fff",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" />
            </svg>
            Episódios
          </button>
          {prevEp && (
            <button onClick={() => navTo(prevEp)} style={{
              width: 48, height: 48, borderRadius: 12, border: "none",
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {nextEp && (
            <button onClick={() => navTo(nextEp)} style={{
              width: 48, height: 48, borderRadius: 12, border: "none",
              background: "#dc2626", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
              boxShadow: "0 4px 16px rgba(220,38,38,0.4)",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </>
  );
}