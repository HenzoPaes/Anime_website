// src/pages/AnimeDetailPage.tsx
import { useState, useMemo, useEffect } from "react";
import { useAnimeById, useRelated, FlatAnime } from "../hooks/useanimes";
import { AnimeSeason, AnimeType } from "../types/anime";
import { CustomDropdown, DropdownOption } from "../components/customdropdown";
import AnimeCard from "../components/animecard";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useWatched } from "../hooks/usewatchlist";
import WatchlistButton from "../components/watchlistbutton";
import { useNotifications } from "../hooks/usenotifications";
import { useAnimes } from "../hooks/useanimes";

interface Props {
  animeId?: string;
  initialSeason?: number;
  initialAudio?: AnimeType;
  onBack?: () => void;
  onWatchEpisode?: (anime: FlatAnime, season: AnimeSeason, audio: AnimeType, episode: number) => void;
  onAnimeClick?: (anime: FlatAnime) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; pulse: boolean }> = {
  ongoing:  { label: "Em exibição", color: "#22c55e", pulse: true  },
  finished: { label: "Finalizado",  color: "#64748b", pulse: false },
  upcoming: { label: "Em breve",    color: "#f59e0b", pulse: false },
};

export function AnimeDetailPage({ animeId: propAnimeId, initialSeason, initialAudio = "sub", onBack, onWatchEpisode, onAnimeClick }: Props) {
  const params = useParams<{ id?: string }>();
  const animeId = propAnimeId ?? params.id ?? "";
  const anime = useAnimeById(animeId);
  const { animes } = useAnimes();
  const navigate = useNavigate();
  const { isWatched } = useWatched();

  const notifAnimes = animes.map(a => ({ id: a.id, title: a.title, cover: a.cover, episodeCount: a.episodeCount }));
  const { isSubscribed, toggleSubscription } = useNotifications(notifAnimes);
  const subscribed = isSubscribed(animeId);

  const [selectedSeason, setSelectedSeason] = useState<number>(
    initialSeason ?? (anime?.seasons[anime.seasons.length - 1]?.season ?? 1)
  );
  const [selectedAudio, setSelectedAudio] = useState<AnimeType>(initialAudio);
  const [showTrailer, setShowTrailer] = useState(false);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    if (!anime) return;
    setSelectedSeason(initialSeason ?? anime.seasons[anime.seasons.length - 1].season);
    setSelectedAudio(initialAudio);
    setShowTrailer(false);
    setEpisodeSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.title = `${anime.title} — AnimeVerse`;
  }, [animeId]);

  const relatedAnimes = useRelated(anime);

  const currentSeason = useMemo(
    () => anime?.seasons.find(s => s.season === selectedSeason),
    [anime, selectedSeason]
  );

  const episodes = useMemo(() => {
    if (!currentSeason) return [];
    if (currentSeason.episodeList && currentSeason.episodeList.length > 0) {
      return currentSeason.episodeList.map((e: any) => ({
        id: e.id, number: e.number, title: e.title,
        duration: e.duration ?? 24, thumbnail: e.thumbnail ?? null,
        embeds: e.embeds || {}, embedCredit: e.embedCredit,
      }));
    }
    const flatSeason = anime?.episodes?.filter((e: any) => String(e.season) === String(currentSeason.season)) ?? [];
    if (flatSeason.length > 0) return flatSeason.map((e: any) => ({
      id: e.id, number: e.number, title: e.title,
      duration: e.duration ?? 24, thumbnail: null,
      embeds: e.embeds || {}, embedCredit: e.embedCredit,
    }));
    return Array.from({ length: currentSeason.currentEpisode ?? 0 }, (_, i) => ({
      id: `mock-${i + 1}`, number: i + 1, title: `Episódio ${i + 1}`,
      duration: 24, thumbnail: null, embeds: {}, embedCredit: "",
    }));
  }, [currentSeason, anime]);

  const availableAudios = currentSeason?.audios.filter(a => {
    if (!a.available) return false;
    return episodes.some(ep => !!(ep.embeds as any)?.[a.type]);
  }) ?? [];

  const effectiveAudio: AnimeType = availableAudios.some(a => a.type === selectedAudio)
    ? selectedAudio : (availableAudios[0]?.type ?? "sub");

  const filteredEpisodes = useMemo(() => {
    if (!currentSeason) return [];
    const audioInfo = currentSeason.audios.find(a => a.type === effectiveAudio);
    const maxEp = audioInfo?.episodesAvailable ?? 0;
    let list = episodes.filter(ep => ep.number <= maxEp && !!(ep.embeds as any)?.[effectiveAudio]);
    if (episodeSearch) list = list.filter(ep =>
      ep.title.toLowerCase().includes(episodeSearch.toLowerCase()) || String(ep.number).includes(episodeSearch)
    );
    return list;
  }, [episodes, episodeSearch, currentSeason, effectiveAudio]);

  if (!anime || !currentSeason) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-400">Anime não encontrado.</p>
          {onBack && <button onClick={onBack} className="mt-4 text-brand-400">← Voltar</button>}
        </div>
      </div>
    );
  }

  const seasonOptions: DropdownOption<number>[] = anime.seasons.map(s => ({
    value: s.season, label: s.seasonLabel, badge: `${s.currentEpisode} eps`,
  }));

  const audioOptions: DropdownOption<string>[] = currentSeason.audios.map(a => ({
    value: a.type, label: a.label, disabled: !a.available,
    badge: a.available ? `${a.episodesAvailable} eps` : "Indisponível",
  }));

  const status = STATUS_CONFIG[currentSeason.status] ?? STATUS_CONFIG.finished;
  const progress = Math.round((currentSeason.currentEpisode / (currentSeason.episodes || 1)) * 100);

  function getYoutubeId(url: string): string | null {
    const m = url?.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  const youtubeId = getYoutubeId(currentSeason.trailer ?? "");

  // Navigate to episode 1 of current season with current audio
  const handleWatchNow = () => {
    const ep1 = filteredEpisodes[0];
    if (!ep1) return;
    const path = `/anime/${encodeURIComponent(anime.id)}/ep/${ep1.id}?audio=${effectiveAudio}`;
    navigate(path);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* HERO */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "relative", height: "clamp(360px, 55vw, 560px)", overflow: "hidden", background: "#111" }}>
          <motion.img
            src={anime.bannerImage || anime.coverImage}
            alt={anime.title}
            onLoad={() => setImgLoaded(true)}
            initial={{ opacity: 0 }} animate={{ opacity: imgLoaded ? 1 : 0 }}
            transition={{ duration: 0.6 }}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", filter: "brightness(0.4)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.55) 55%, transparent 100%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.7) 0%, transparent 60%)" }} />
          {onBack && (
            <button onClick={onBack} style={{
              position: "absolute", top: 20, left: 24,
              background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
              color: "rgba(255,255,255,0.8)", fontSize: 13, padding: "8px 14px",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>← Voltar</button>
          )}
        </div>

        {/* Hero info */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 clamp(20px, 5vw, 72px) 36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: `${status.color}1a`, border: `1px solid ${status.color}40`,
              borderRadius: 6, padding: "4px 10px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: status.color, display: "inline-block",
                animation: status.pulse ? "pulse 2s ease-in-out infinite" : "none" }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: status.color, textTransform: "uppercase" }}>
                {status.label}
              </span>
            </div>
            {anime.recommended && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6,
                background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", textTransform: "uppercase" }}>
                ⭐ Recomendado
              </span>
            )}
          </div>

          <h1 style={{ fontSize: "clamp(24px, 4.5vw, 52px)", fontWeight: 800, lineHeight: 1.1, color: "#fff", marginBottom: 4 }}>
            {anime.title}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 14 }}>{anime.titleJapanese}</p>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 20px", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>✨ {currentSeason.score?.toFixed(1)}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{currentSeason.year}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{anime.studio}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{currentSeason.currentEpisode}/{currentSeason.episodes} eps</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {anime.genre.map(g => (
                <span key={g} style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5,
                  background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.28)", color: "rgba(167,139,250,0.9)" }}>
                  {g}
                </span>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.65)", maxWidth: 620,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {currentSeason.synopsis}
          </p>
        </div>
      </div>

      {/* CONTROLS */}
      <div style={{ padding: "24px clamp(20px, 5vw, 72px)", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>

        {anime.seasons.length > 1 && (
          <div style={{ minWidth: 190 }}>
            <CustomDropdown<number>
              label="Temporada" options={seasonOptions} value={selectedSeason}
              onChange={v => { setSelectedSeason(v); setEpisodeSearch(""); }} size="md"
            />
          </div>
        )}

        <div style={{ minWidth: 220 }}>
          <CustomDropdown<string>
            label="Áudio" options={audioOptions} value={effectiveAudio}
            onChange={v => setSelectedAudio(v as AnimeType)} size="md"
          />
        </div>

        {/* Watch Now button - goes to ep 1 of selected season/audio */}
        <button onClick={handleWatchNow} disabled={filteredEpisodes.length === 0}
          style={{
            height: 40, padding: "0 24px", borderRadius: 10,
            background: filteredEpisodes.length > 0 ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "#333",
            color: "#fff", fontSize: 13, fontWeight: 600, border: "none",
            cursor: filteredEpisodes.length > 0 ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
          ▶ Assistir do início
        </button>

        {/* Notification subscribe */}
        <button onClick={() => toggleSubscription(animeId)}
          style={{
            height: 40, padding: "0 16px", borderRadius: 10,
            background: subscribed ? "rgba(244,63,94,0.15)" : "rgba(255,255,255,0.05)",
            border: subscribed ? "1px solid rgba(244,63,94,0.4)" : "1px solid rgba(255,255,255,0.12)",
            color: subscribed ? "#f43f5e" : "rgba(255,255,255,0.6)", fontSize: 13,
            fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
          {subscribed ? "🔔 Inscrito" : "🔕 Receber Notificações"}
        </button>

        {youtubeId && (
          <button onClick={() => setShowTrailer(p => !p)}
            style={{
              height: 40, padding: "0 20px", borderRadius: 10,
              background: "transparent",
              border: showTrailer ? "1px solid rgba(124,58,237,0.6)" : "1px solid rgba(255,255,255,0.12)",
              color: showTrailer ? "#c4b5fd" : "rgba(255,255,255,0.7)", fontSize: 13,
              fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            }}>
            {showTrailer ? "✕ Fechar trailer" : "▷ Trailer"}
          </button>
        )}

        <WatchlistButton animeId={animeId} compact />
      </div>

      {/* TRAILER */}
      <AnimatePresence>
        {showTrailer && youtubeId && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", padding: "0 clamp(20px, 5vw, 72px) 32px" }}>
            <div style={{ position: "relative", paddingBottom: "56.25%", borderRadius: 14, overflow: "hidden", maxWidth: 880, marginTop: 24 }}>
              <iframe src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`} title="Trailer"
                allow="autoplay; encrypted-media" allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SYNOPSIS + PROGRESS */}
      <div style={{ padding: "28px clamp(20px, 5vw, 72px)", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "grid", gridTemplateColumns: "1fr auto", gap: "24px 40px" }}>
        <div>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Sinopse · {currentSeason.seasonLabel}</h2>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.72)", maxWidth: 720 }}>
            {currentSeason.synopsis}
          </p>
        </div>
        <div style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12,
          padding: "16px 20px", minWidth: 180 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>Progresso</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            {currentSeason.currentEpisode}
            <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}> / {currentSeason.episodes}</span>
          </p>
          <div style={{ marginTop: 10, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }}
              transition={{ delay: 0.5, duration: 0.8 }}
              style={{ height: "100%", background: "linear-gradient(90deg,#7c3aed,#a855f7)", borderRadius: 4 }} />
          </div>
          <p style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{progress}% lançado</p>
        </div>
      </div>

      {/* EPISODE LIST */}
      <div style={{ padding: "28px clamp(20px, 5vw, 72px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Episódios</h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {currentSeason.seasonLabel} · {effectiveAudio === "dub" ? "Dublado" : "Legendado"} · {filteredEpisodes.length} disponíveis
            </p>
          </div>
          <div style={{ position: "relative" }}>
            <input type="text" placeholder="Buscar episódio..." value={episodeSearch}
              onChange={e => setEpisodeSearch(e.target.value)}
              style={{ height: 36, padding: "0 36px 0 14px", background: "#161616", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 9, color: "#fff", fontSize: 13, outline: "none", width: 200 }}
              onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.1)")} />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.3)", pointerEvents: "none" }}>⌕</span>
          </div>
        </div>

        <AnimatePresence>
          {filteredEpisodes.length === 0 ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              Nenhum episódio disponível.
            </motion.p>
          ) : (
            <motion.div variants={{ animate: { transition: { staggerChildren: 0.03 } } }} initial="initial" animate="animate"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {filteredEpisodes.map(ep => {
                const watched = anime && isWatched(anime.id, ep.id);
                return (
                  <EpisodeBtn
                    key={ep.id ?? ep.number}
                    episode={ep}
                    watched={!!watched}
                    onPlay={() => {
                      if (onWatchEpisode) {
                        onWatchEpisode(anime, currentSeason, effectiveAudio, ep.number);
                      } else {
                        navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}?audio=${effectiveAudio}`);
                      }
                    }}
                  />
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* RELATED */}
      {relatedAnimes.length > 0 && (
        <div style={{ padding: "0 clamp(20px, 5vw, 72px) 60px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 18 }}>Você também pode gostar</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
            {relatedAnimes.map(related => (
              <AnimeCard key={related.id} anime={related} onClick={onAnimeClick} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.3;transform:scale(.8)} }
      `}</style>
    </motion.div>
  );
}

// ── Episode button ──────────────────────────────────────────────────────────
function EpisodeBtn({ episode, watched, onPlay }: {
  episode: any; watched: boolean; onPlay: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      variants={{ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } }}
      onClick={onPlay}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 14px", borderRadius: 10, width: "100%", textAlign: "left",
        background: hovered ? "rgba(124,58,237,0.1)" : watched ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.03)",
        border: watched
          ? "1px solid rgba(34,197,94,0.4)"
          : hovered
          ? "1px solid rgba(124,58,237,0.3)"
          : "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer", transition: "all 0.18s",
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: hovered ? "rgba(124,58,237,0.25)" : watched ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
        fontSize: 12, fontWeight: 700,
        color: hovered ? "#c4b5fd" : watched ? "#4ade80" : "rgba(255,255,255,0.5)",
        transition: "all 0.18s",
      }}>
        {hovered ? "▶" : watched ? "✓" : episode.number}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 500,
          color: hovered ? "#fff" : watched ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.8)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color 0.18s",
        }}>
          {episode.title}
        </p>
        <p style={{ fontSize: 11, color: watched ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.3)", marginTop: 2 }}>
          {watched ? "✓ Assistido" : `${episode.duration ?? 24} min`}
        </p>
      </div>
    </motion.button>
  );
}

export default AnimeDetailPage;
