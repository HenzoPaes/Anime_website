import { useState, useMemo, useEffect } from "react";
import { useAnimeById, useRelated, FlatAnime } from "../hooks/useAnimes";
import { AnimeSeason, AnimeType } from "../types/anime";
import { CustomDropdown, DropdownOption } from "../components/CustomDropdown";
import AnimeCard from "../components/AnimeCard";
// Se for usado com React Router v6, podemos extrair o parâmetro diretamente
import { useParams, useNavigate } from "react-router-dom";
import WatchButton from "../components/WatchButton";
import { motion, AnimatePresence } from "framer-motion";

// ── Adapte conforme seu router ──────────────────────────────────────────────
// Se usar React Router v6:
// import { useParams, useNavigate, useSearchParams } from "react-router-dom";
//
// Se não tiver router, passe as props diretamente:
interface AnimeDetailPageProps {
  animeId: string;
  initialSeason?: number;
  initialAudio?: AnimeType;
  onBack?: () => void;
  onWatchEpisode?: (anime: FlatAnime, season: AnimeSeason, audio: AnimeType, episode: number) => void;
  onAnimeClick?: (anime: FlatAnime) => void;
}

// ── Dados de exemplo de episódios (substitua pela API real) ─────────────────
function mockEpisodes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `Episódio ${i + 1}`,
    duration: 24,
    thumbnail: null as string | null,
  }));
}

// ── Configs estáticas ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; pulse: boolean }> = {
  ongoing:  { label: "Em exibição", color: "#22c55e", pulse: true  },
  finished: { label: "Finalizado",  color: "#64748b", pulse: false },
  upcoming: { label: "Em breve",    color: "#f59e0b", pulse: false },
};

// ── Componente principal ────────────────────────────────────────────────────
export function AnimeDetailPage({
  animeId: propAnimeId,
  initialSeason,
  initialAudio = "sub",
  onBack,
  onWatchEpisode,
  onAnimeClick,
}: AnimeDetailPageProps) {
  // router params override prop when não fornecido
  const params = useParams<{ id?: string }>();
  const animeId = propAnimeId ?? params.id ?? "";
  const anime = useAnimeById(animeId);

  // Temporada e áudio selecionados
  const [selectedSeason, setSelectedSeason] = useState<number>(
    initialSeason ?? (anime?.seasons[anime.seasons.length - 1]?.season ?? 1)
  );
  const [selectedAudio, setSelectedAudio] = useState<AnimeType>(initialAudio);
  const [showTrailer, setShowTrailer]       = useState(false);
  const [episodeSearch, setEpisodeSearch]   = useState("");
  const [imgLoaded, setImgLoaded]           = useState(false);

  // Sincroniza se animeId mudar (navegação entre animes)
  useEffect(() => {
    if (!anime) return;
    const last = anime.seasons[anime.seasons.length - 1];
    setSelectedSeason(initialSeason ?? last.season);
    setSelectedAudio(initialAudio);
    setShowTrailer(false);
    setEpisodeSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [animeId]);

  const relatedAnimes = useRelated(anime);

  const currentSeason: AnimeSeason | undefined = useMemo(
    () => anime?.seasons.find((s) => s.season === selectedSeason),
    [anime, selectedSeason]
  );


  const navigate = useNavigate();

  // detalhe localizado para episódios retornados neste componente
  interface DetailEpisode {
    id?: string;
    number: number;
    title: string;
    duration: number;
    thumbnail: string | null;
    embeds?: { sub?: string; dub?: string };
    embedCredit?: string;
  }

  const episodes = useMemo<DetailEpisode[]>(() => {
    // Prefere lista detalhada por temporada quando existir
    if (currentSeason?.episodeList && currentSeason.episodeList.length > 0) {
      return currentSeason.episodeList.map((e: any) => ({
        id: e.id,
        number: e.number,
        title: e.title,
        duration: e.duration ?? 24,
        thumbnail: e.thumbnail ?? null,
        embeds: e.embeds || {},
        embedCredit: e.embedCredit,
      }));
    }

    // Fallback: usa lista plana do anime (agregada em useAnimes)
    const flatSeason = anime.episodes?.filter((e: any) => e.season === currentSeason?.season) ?? [];
    if (flatSeason.length > 0) {
      return flatSeason.map((e: any) => ({
        id: e.id,
        number: e.number,
        title: e.title,
        duration: e.duration ?? 24,
        thumbnail: e.thumbnail ?? null,
        embeds: e.embeds || {},
        embedCredit: e.embedCredit,
      }));
    }

    // Último recurso: gera mock estável pelo número de episódios
    return mockEpisodes(currentSeason?.currentEpisode ?? 0);
  }, [currentSeason?.currentEpisode, currentSeason?.episodeList, anime.episodes, currentSeason?.season]);

  // Garante áudio disponível (após criar lista de episódios para checar embeds)
  const availableAudios = currentSeason?.audios.filter((a) => {
    if (!a.available) return false;
    // apenas se houver pelo menos um episódio com embed desse tipo
    return episodes.some(ep => !!(ep.embeds && (ep.embeds as any)[a.type]));
  }) ?? [];
  const effectiveAudio: AnimeType = availableAudios.some((a) => a.type === selectedAudio)
    ? selectedAudio
    : (availableAudios[0]?.type ?? "sub");

  const filteredEpisodes = useMemo(() => {
    if (!currentSeason) return [];

    const audioInfo = currentSeason.audios.find(a => a.type === effectiveAudio);
    const maxEp = audioInfo?.episodesAvailable ?? 0;

    let episodesToShow = episodes.filter(ep => ep.number <= maxEp);

    // 〰 Filtra também pela presença de embed correspondente ao áudio escolhido
    episodesToShow = episodesToShow.filter(ep => {
      const embed = ep.embeds ? (ep.embeds as any)[effectiveAudio] : undefined;
      return !!embed;
    });

    if (episodeSearch) {
      episodesToShow = episodesToShow.filter(ep =>
        ep.title.toLowerCase().includes(episodeSearch.toLowerCase()) ||
        String(ep.number).includes(episodeSearch)
      );
    }
    
    return episodesToShow;
  }, [episodes, episodeSearch, currentSeason, effectiveAudio]);

  // ── Early return: anime não encontrado ─────────────────────────────────────
  if (!anime || !currentSeason) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 16 }}>Anime não encontrado.</p>
          {onBack && (
            <button onClick={onBack} style={{ marginTop: 16, color: "#a78bfa", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
              ← Voltar
            </button>
          )}
        </div>
      </div>
    );
  }
  const dubInfo = currentSeason.audios.find(a => a.type === 'dub');
  const subInfo = currentSeason.audios.find(a => a.type === 'sub');
  
  // ── Dropdown options ────────────────────────────────────────────────────────
  const seasonOptions: DropdownOption<number>[] = anime.seasons.map((s) => ({
    value: s.season,
    label: s.seasonLabel,
    badge: `${s.currentEpisode} eps`,
  }));

  const audioOptions: DropdownOption<string>[] = currentSeason.audios.map((a) => ({
    value:    a.type,
    label:    a.label,
    disabled: !a.available,
    badge:    a.available ? `${a.episodesAvailable} eps` : "Indisponível",
  }));

  const status        = STATUS_CONFIG[currentSeason.status] ?? STATUS_CONFIG.finished;
  const isMultiSeason = anime.seasons.length > 1;
  const progress      = Math.round((currentSeason.currentEpisode / currentSeason.episodes) * 100);

  // Extrai o ID do YouTube do trailer para embed
  function getYoutubeId(url: string): string | null {
    const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  const youtubeId = getYoutubeId(currentSeason.trailer ?? "");

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div 
      initial="initial"
      animate="animate"
      variants={{
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { staggerChildren: 0.08 } }
      }}
      style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "inherit" }}
    >

      {/* ═══════════════════════════════════════════════════════════
          HERO — banner + info principal
      ═══════════════════════════════════════════════════════════ */}
      <motion.div 
        variants={{ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } } }}
        style={{ position: "relative", width: "100%", overflow: "hidden" }}
      >
        {/* Banner */}
        <div
          style={{
            position: "relative",
            height: "clamp(360px, 55vw, 580px)",
            overflow: "hidden",
            background: "#111",
          }}
        >
          <motion.img
            src={anime.bannerImage || anime.coverImage}
            alt={anime.title}
            onLoad={() => setImgLoaded(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: imgLoaded ? 1 : 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top",
              filter: "brightness(0.45)",
            }}
          />

          {/* Gradientes */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.55) 55%, transparent 100%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.7) 0%, transparent 60%)" }} />

          {/* Botão voltar */}
          {onBack && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 0.5 } }}
              onClick={onBack}
              style={{
                position: "absolute", top: 20, left: 24,
                background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500,
                padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.5)"; }}
            >
              ← Voltar
            </motion.button>
          )}
        </div>

        {/* Info sobre o banner */}
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "0 clamp(20px, 5vw, 72px) 36px",
            display: "flex", alignItems: "flex-end", gap: 32,
          }}
        >
          {/* Poster */}
          <motion.div
            variants={{ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.4 } } }}
            style={{
              flexShrink: 0, width: "clamp(100px, 14vw, 160px)",
              aspectRatio: "2/3", borderRadius: 12, overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
              border: "2px solid rgba(255,255,255,0.1)",
              display: "none",
            }}
            className="detail-poster"
          >
            <img src={anime.coverImage} alt={anime.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </motion.div>

          {/* Texto */}
          <motion.div 
            variants={{ initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0, transition: { delay: 0.35, duration: 0.5 } } }}
            style={{ flex: 1, minWidth: 0 }}
          >
            {/* Status & Recommended badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div
                className="status-badge"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: `${status.color}1a`, border: `1px solid ${status.color}40`,
                  borderRadius: 6, padding: "4px 10px",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%", background: status.color, display: "inline-block",
                  animation: status.pulse ? "heroPulse 2s ease-in-out infinite" : "none",
                }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", color: status.color, textTransform: "uppercase" }}>
                  {status.label}
                </span>
              </div>
              
              {anime.recommended && (
                <div className="recommended-badge">
                  <span>⭐ RECOMENDADO</span>
                </div>
              )}
            </div>

            {/* Título */}
            <h1
              style={{
                fontSize: "clamp(24px, 4.5vw, 52px)", fontWeight: 800,
                lineHeight: 1.1, letterSpacing: "-0.02em",
                color: "#fff", marginBottom: 4,
                textShadow: "0 2px 20px rgba(0,0,0,0.5)",
              }}
            >
              {anime.title}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              {anime.titleJapanese}
            </p>

            {/* Meta row */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 20px", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>
                ✨ {currentSeason.score.toFixed(1)}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {currentSeason.year}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {anime.studio}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {currentSeason.currentEpisode}/{currentSeason.episodes} eps
              </span>

              {/* Gêneros */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {anime.genre.map((g) => (
                  <span
                    key={g}
                    style={{
                      fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5,
                      background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.28)",
                      color: "rgba(167,139,250,0.9)", letterSpacing: "0.04em",
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>

            {/* Sinopse curta */}
            <p
              style={{
                fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.65)",
                maxWidth: 620,
                display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}
            >
              {currentSeason.synopsis}
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          CONTROLES — temporada, áudio, ações
      ═══════════════════════════════════════════════════════════ */}
      <motion.div
        variants={{ initial: { opacity: 0 }, animate: { opacity: 1 } }}
        style={{
          padding: "24px clamp(20px, 5vw, 72px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end",
        }}
      >
        {/* Temporada dropdown */}
        {isMultiSeason && (
          <div style={{ minWidth: 190 }}>
            <CustomDropdown<number>
              label="Temporada"
              options={seasonOptions}
              value={selectedSeason}
              onChange={(v) => {
                setSelectedSeason(v);
                setEpisodeSearch("");
              }}
              size="md"
            />
          </div>
        )}

        {/* Áudio dropdown */}
        <div style={{ minWidth: 220 }}>
          <CustomDropdown<string>
            label="Áudio"
            options={audioOptions}
            value={effectiveAudio}
            onChange={(v) => setSelectedAudio(v as AnimeType)}
            size="md"
          />
        </div>

        {/* Botão assistir primeiro ep */}
        <button
          onClick={() => onWatchEpisode?.(anime, currentSeason, effectiveAudio, 1)}
          style={{
            height: 40, padding: "0 24px", borderRadius: 10,
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            border: "none", cursor: "pointer", flexShrink: 0,
            transition: "filter 0.15s, transform 0.1s",
            display: "flex", alignItems: "center", gap: 8,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.filter = "brightness(1.18)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.filter = "brightness(1)")}
        >
          ▶ Assistir do início
        </button>

        {/* Botão trailer */}
        {youtubeId && (
          <button
            onClick={() => setShowTrailer((p) => !p)}
            style={{
              height: 40, padding: "0 20px", borderRadius: 10,
              background: "transparent",
              border: showTrailer
                ? "1px solid rgba(124,58,237,0.6)"
                : "1px solid rgba(255,255,255,0.12)",
              color: showTrailer ? "#c4b5fd" : "rgba(255,255,255,0.7)",
              fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0,
              transition: "all 0.2s", display: "flex", alignItems: "center", gap: 8,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,58,237,0.5)"; }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = showTrailer
                ? "rgba(124,58,237,0.6)"
                : "rgba(255,255,255,0.12)";
            }}
          >
            {showTrailer ? "✕ Fechar trailer" : "▷ Ver trailer"}
          </button>
        )}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          TRAILER embed
      ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showTrailer && youtubeId && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: "auto", y: 0, transition: { duration: 0.3, ease: "easeOut" } }}
            exit={{ opacity: 0, height: 0, y: -20, transition: { duration: 0.25 } }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 clamp(20px, 5vw, 72px) 32px" }}>
              <div
                style={{
                  position: "relative", paddingBottom: "56.25%",
                  borderRadius: 14, overflow: "hidden",
                  maxWidth: 880, margin: "24px 0 0",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                  title="Trailer"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
          DETALHES da temporada — sinopse, recomendação, progresso
      ═══════════════════════════════════════════════════════════ */}
      <motion.div
        variants={{ initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.5, ease: "easeOut" } } }}
        style={{
          padding: "28px clamp(20px, 5vw, 72px)",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "24px 40px",
          alignItems: "start",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Coluna Esquerda: Sinopse + Recomendação */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 10 }}>
            Sinopse · {currentSeason.seasonLabel}
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.72)", maxWidth: 720, marginBottom: anime.recommendationReason ? 24 : 0 }}>
            {currentSeason.synopsis}
          </p>

          {anime.recommendationReason && (
            <div className="recommendation-box">
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#f59e0b", marginBottom: 8 }}>
                ⭐ Por que recomendamos?
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.72)", maxWidth: 720, borderLeft: "3px solid #f59e0b", paddingLeft: 16, fontStyle: "italic" }}>
                {anime.recommendationReason}
              </p>
            </div>
          )}
        </div>

        {/* Coluna Direita: Progress card */}
        <div
          style={{
            background: "#161616", border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "16px 20px", minWidth: 180, flexShrink: 0,
            gridRow: "1 / span 2"
          }}
        >
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
            Progresso
          </p>
          <p style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            {currentSeason.currentEpisode}
            <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.4)" }}> / {currentSeason.episodes}</span>
          </p>
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.2, 0.7, 0.4, 0.9] }}
            style={{ marginTop: 10, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}
          >
            <div style={{ height: "100%", background: "linear-gradient(90deg,#7c3aed,#a855f7)", borderRadius: 4 }} />
          </motion.div>
          <p style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{progress}% lançado</p>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          LISTA DE EPISÓDIOS
      ═══════════════════════════════════════════════════════════ */}
      <motion.div 
        variants={{ initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0, transition: { delay: 0.15, duration: 0.5, ease: "easeOut" } } }}
        style={{ padding: "28px clamp(20px, 5vw, 72px)" }}
      >
        {/* Header da seção */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
              Episódios
            </h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {currentSeason.seasonLabel} · {effectiveAudio === "dub" ? "Dublado" : "Legendado"}
            </p>
          </div>

          {/* Busca de episódio */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Buscar episódio..."
              value={episodeSearch}
              onChange={(e) => setEpisodeSearch(e.target.value)}
              style={{
                height: 36, padding: "0 36px 0 14px",
                background: "#161616", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 9, color: "#fff", fontSize: 13,
                outline: "none", width: 200,
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
            />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)", fontSize: 13, pointerEvents: "none" }}>
              ⌕
            </span>
          </div>
        </div>

        {/* Grid de episódios */}
        <AnimatePresence>
          {filteredEpisodes.length === 0 ? (
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}
            >
              Nenhum episódio encontrado.
            </motion.p>
          ) : (
            <motion.div
              variants={{
                initial: {},
                animate: { transition: { staggerChildren: 0.04 } }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 10,
              }}
            >
              {filteredEpisodes.map((ep) => {
                const hasDubEmbed = !!(ep as any).embeds?.dub;
                const hasSubEmbed = !!(ep as any).embeds?.sub;
                const isDub = hasDubEmbed && !!(dubInfo?.available && ep.number <= dubInfo.episodesAvailable);
                const isSub = hasSubEmbed && !!(subInfo?.available && ep.number <= subInfo.episodesAvailable);

                return (
                  <EpisodeRow
                    key={(ep as any).id ?? ep.number}
                    episode={ep}
                    isDub={isDub}
                    isSub={isSub}
                    onPlay={() => {
                      if (onWatchEpisode) {
                        onWatchEpisode(anime, currentSeason, effectiveAudio, ep.number);
                      } else {
                        const epId = (ep as any).id ?? String(ep.number);
                        navigate(`/anime/${anime.id}/ep/${epId}?audio=${effectiveAudio}`);
                      }
                    }}
                  />
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          ANIMES RELACIONADOS
      ═══════════════════════════════════════════════════════════ */}
      {relatedAnimes.length > 0 && (
        <motion.div
          variants={{ initial: { opacity: 0, y: 15 }, animate: { opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.5, ease: "easeOut" } } }}
          style={{
            padding: "0 clamp(20px, 5vw, 72px) 60px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: 32,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 18, letterSpacing: "-0.01em" }}>
            Você também pode gostar
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 16,
            }}
          >
            {relatedAnimes.map((related) => (
              <AnimeCard
                key={related.id}
                anime={related}
                onClick={onAnimeClick}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Animações e estilos globais */}
      <style>{`
        @keyframes heroPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.3; transform:scale(.8); }
        }
        .detail-poster {
          display: block !important;
        }
        @media (max-width: 600px) {
          .detail-poster { display: none !important; }
        }
        .recommended-badge {
          display: inline-flex;
          align-items: center;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.09em;
          color: #f59e0b;
          text-transform: uppercase;
        }
      `}</style>
    </motion.div>
  );
}

// ── Sub-componente: linha de episódio ───────────────────────────────────────
interface EpisodeRowProps {
  episode: { number: number; title: string; duration: number; thumbnail: string | null; };
  isDub: boolean;
  isSub: boolean;
  onPlay: () => void;
}

function AudioBadge({ type }: { type: "DUB" | "SUB" }) {
  const isDub = type === "DUB";
  return (
    <span style={{
      padding: '2px 5px',
      borderRadius: 4,
      fontSize: 9,
      fontWeight: 700,
      background: isDub ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.15)',
      color: isDub ? 'rgba(147, 197, 253, 1)' : 'rgba(255, 255, 255, 0.7)',
      border: `1px solid ${isDub ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.2)'}`,
      letterSpacing: '0.04em',
    }}>
      {type}
    </span>
  );
}

function EpisodeRow({ episode, isDub, isSub, onPlay }: EpisodeRowProps) {
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
        background: hovered ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.03)",
        border: hovered ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer", transition: "all 0.18s",
      }}
    >
      {/* Número */}
      <span
        style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hovered ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
          fontSize: 12, fontWeight: 700,
          color: hovered ? "#c4b5fd" : "rgba(255,255,255,0.5)",
          transition: "all 0.18s",
        }}
      >
        {hovered ? "▶" : episode.number}
      </span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 500, color: hovered ? "#fff" : "rgba(255,255,255,0.8)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "color 0.18s",
        }}>
          {episode.title}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {isDub && <AudioBadge type="DUB" />}
          {isSub && <AudioBadge type="SUB" />}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {episode.duration} min
          </p>
        </div>
      </div>
    </motion.button>
  );
}

export default AnimeDetailPage;