// src/pages/AnimeDetailPage.tsx
import { useState, useMemo, useEffect, useRef } from "react";
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

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  animeId?: string;
  initialSeason?: number;
  initialAudio?: AnimeType;
  onBack?: () => void;
  onWatchEpisode?: (anime: FlatAnime, season: AnimeSeason, audio: AnimeType, episode: number) => void;
  onAnimeClick?: (anime: FlatAnime) => void;
}

type NotifFrequency = "every" | "every5" | "finale" | "none";

interface NotifSettings {
  frequency: NotifFrequency;
  pushEnabled: boolean;
}

const DEFAULT_NOTIF: NotifSettings = { frequency: "every", pushEnabled: false };

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; pulse: boolean }> = {
  ongoing:  { label: "Em exibição", color: "#22c55e", pulse: true  },
  finished: { label: "Finalizado",  color: "#64748b", pulse: false },
  upcoming: { label: "Em breve",    color: "#f59e0b", pulse: false },
};

const NOTIF_FREQ_OPTIONS: { value: NotifFrequency; label: string; desc: string; icon: string }[] = [
  { value: "every",  label: "Todo episódio", desc: "Notifique-me assim que sair",    icon: "⚡" },
  { value: "every5", label: "A cada 5 eps",  desc: "Receba notificações em lote",    icon: "📦" },
  { value: "finale", label: "Só o finale",   desc: "Último episódio da temporada",   icon: "🏁" },
  { value: "none",   label: "Desativar",      desc: "Não receber notificações",       icon: "🔕" },
];

// ── Utility ──────────────────────────────────────────────────────────────────

function getYoutubeId(url: string): string | null {
  const m = url?.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function requestPushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

// ── Adult Content Modal ───────────────────────────────────────────────────────

function AdultContentModal({ animeTitle, onAccept, onReject }: {
  animeTitle: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.88)",
          backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          style={{
            background: "#0f0f1a",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 20,
            padding: "36px 32px",
            maxWidth: 460,
            width: "100%",
            boxShadow: "0 0 0 1px rgba(239,68,68,0.1), 0 32px 80px rgba(0,0,0,0.8)",
          }}
        >
          {/* Icon */}
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, marginBottom: 20,
          }}>
            🔞
          </div>

          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8, padding: "4px 10px",
            marginBottom: 14,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#ef4444", textTransform: "uppercase" }}>
              Conteúdo Adulto — 18+
            </span>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8, lineHeight: 1.2 }}>
            {animeTitle}
          </h2>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, marginBottom: 24 }}>
            Este anime contém conteúdo recomendado apenas para adultos, incluindo cenas de violência intensa, nudez
            e/ou linguagem explícita. Ao continuar, você confirma que é maior de 18 anos.
          </p>

          {/* Checkbox */}
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            cursor: "pointer", marginBottom: 24,
          }}>
            <div
              onClick={() => setChecked(c => !c)}
              style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                background: checked ? "#ef4444" : "transparent",
                border: `2px solid ${checked ? "#ef4444" : "rgba(255,255,255,0.2)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s", cursor: "pointer",
              }}
            >
              {checked && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              Confirmo que tenho <strong style={{ color: "#fff" }}>18 anos ou mais</strong> e sou{" "}
              <strong style={{ color: "#fff" }}>totalmente responsável</strong> pelo conteúdo que escolho assistir.
            </span>
          </label>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onReject}
              style={{
                flex: 1, height: 44, borderRadius: 10,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(255,255,255,0.5)",
                fontSize: 14, fontWeight: 500, cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)"; }}
            >
              ← Voltar
            </button>
            <button
              onClick={() => { if (checked) onAccept(); }}
              disabled={!checked}
              style={{
                flex: 2, height: 44, borderRadius: 10,
                background: checked ? "linear-gradient(135deg, #ef4444, #dc2626)" : "rgba(239,68,68,0.1)",
                border: checked ? "none" : "1px solid rgba(239,68,68,0.2)",
                color: checked ? "#fff" : "rgba(239,68,68,0.35)",
                fontSize: 14, fontWeight: 700,
                cursor: checked ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                boxShadow: checked ? "0 4px 20px rgba(239,68,68,0.3)" : "none",
              }}
            >
              Entendi, continuar →
            </button>
          </div>

          <p style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
            Sua escolha fica salva durante esta sessão.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Notification Panel ────────────────────────────────────────────────────────

interface NotifPanelProps {
  animeId: string;
  animeTitle: string;
  subscribed: boolean;
  onToggle: () => void;
}

function NotificationPanel({ animeId, animeTitle, subscribed, onToggle }: NotifPanelProps) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<NotifSettings>(() => {
    try {
      const stored = localStorage.getItem(`notif:${animeId}`);
      return stored ? JSON.parse(stored) : DEFAULT_NOTIF;
    } catch { return DEFAULT_NOTIF; }
  });
  const [pushStatus, setPushStatus] = useState<"idle" | "requesting" | "granted" | "denied">(
    Notification?.permission === "granted" ? "granted" : "idle"
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(`notif:${animeId}`, JSON.stringify(settings));
  }, [animeId, settings]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handlePushToggle = async () => {
    if (settings.pushEnabled) { setSettings(s => ({ ...s, pushEnabled: false })); return; }
    setPushStatus("requesting");
    const granted = await requestPushPermission();
    setPushStatus(granted ? "granted" : "denied");
    if (granted) setSettings(s => ({ ...s, pushEnabled: true }));
  };

  const handleFreqChange = (freq: NotifFrequency) => {
    setSettings(s => ({ ...s, frequency: freq }));
    if (freq === "none" && subscribed) onToggle();
    if (freq !== "none" && !subscribed) onToggle();
  };

  const handleMainToggle = () => {
    onToggle();
    setSettings(s => ({ ...s, frequency: subscribed ? "none" : "every" }));
  };

  const activeFreq = subscribed ? settings.frequency : "none";
  const bellIcon   = subscribed ? "🔔" : "🔕";

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          height: 40, padding: "0 16px", borderRadius: 10,
          background: subscribed ? "rgba(244,63,94,0.12)" : "rgba(255,255,255,0.05)",
          border: subscribed ? "1px solid rgba(244,63,94,0.35)" : "1px solid rgba(255,255,255,0.1)",
          color: subscribed ? "#f43f5e" : "rgba(255,255,255,0.55)",
          fontSize: 13, fontWeight: 500, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 15 }}>{bellIcon}</span>
        <span>{subscribed ? "Inscrito" : "Notificações"}</span>
        {subscribed && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
            background: "rgba(244,63,94,0.2)", color: "#f87171",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            {NOTIF_FREQ_OPTIONS.find(o => o.value === activeFreq)?.label ?? ""}
          </span>
        )}
        <span style={{
          fontSize: 10, color: "inherit", opacity: 0.5,
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}>▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{
              position: "absolute", top: "calc(100% + 8px)", left: 0,
              width: 300, zIndex: 100,
              background: "#111318", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 14,
              boxShadow: "0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.1)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 2 }}>Notificações</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{animeTitle}</p>
            </div>

            <div style={{ padding: "10px 8px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", padding: "0 8px", marginBottom: 6 }}>
                Frequência de notificação
              </p>
              {NOTIF_FREQ_OPTIONS.map(opt => {
                const isActive = activeFreq === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleFreqChange(opt.value)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 9, border: "none",
                      background: isActive ? "rgba(124,58,237,0.15)" : "transparent",
                      cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                      outline: isActive ? "1px solid rgba(124,58,237,0.3)" : "none",
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isActive ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.05)", fontSize: 14 }}>
                      {opt.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "#c4b5fd" : "rgba(255,255,255,0.75)" }}>{opt.label}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{opt.desc}</p>
                    </div>
                    {isActive && (
                      <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff" }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ margin: "0 8px 8px", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>Push notifications</p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                    {pushStatus === "denied" ? "Bloqueado pelo navegador" : settings.pushEnabled ? "Ativo no navegador" : "Requer permissão do navegador"}
                  </p>
                </div>
                <button
                  onClick={handlePushToggle}
                  disabled={pushStatus === "requesting" || pushStatus === "denied"}
                  style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: settings.pushEnabled ? "#7c3aed" : "rgba(255,255,255,0.1)",
                    border: "none", cursor: pushStatus === "denied" ? "not-allowed" : "pointer",
                    position: "relative", flexShrink: 0, transition: "background 0.2s",
                    opacity: pushStatus === "denied" ? 0.4 : 1,
                  }}
                >
                  <motion.span
                    animate={{ x: settings.pushEnabled ? 20 : 2 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ position: "absolute", top: 2, left: 0, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", display: "block" }}
                  />
                </button>
              </div>
              {pushStatus === "requesting" && <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>⏳ Aguardando permissão…</p>}
            </div>

            {subscribed && (
              <div style={{ padding: "0 8px 8px" }}>
                <button
                  onClick={() => { handleMainToggle(); setOpen(false); }}
                  style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "transparent", color: "rgba(244,63,94,0.6)", fontSize: 12, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f43f5e"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(244,63,94,0.07)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(244,63,94,0.6)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  Cancelar inscrição
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnimeDetailPage({
  animeId: propAnimeId,
  initialSeason,
  initialAudio = "sub",
  onBack,
  onWatchEpisode,
  onAnimeClick,
}: Props) {
  const params     = useParams<{ id?: string }>();
  const animeId    = propAnimeId ?? params.id ?? "";
  const anime      = useAnimeById(animeId);
  const { animes } = useAnimes();
  const navigate   = useNavigate();
  const { isWatched } = useWatched();

  const notifAnimes = animes.map(a => ({ id: a.id, title: a.title, cover: a.cover, episodeCount: a.episodeCount }));
  const { isSubscribed, toggleSubscription } = useNotifications(notifAnimes);
  const subscribed = isSubscribed(animeId);

  // ── Adult Content Gate ────────────────────────────────────────────────────
  const isAdult = !!(anime as any)?.adultContent;
  const [adultAccepted, setAdultAccepted] = useState(() => {
    // Verifica na sessão atual (sem persistir entre abas fechadas)
    try { return sessionStorage.getItem(`adult-ok:${animeId}`) === "yes"; }
    catch { return false; }
  });

  const handleAdultAccept = () => {
    try { sessionStorage.setItem(`adult-ok:${animeId}`, "yes"); }
    catch {}
    setAdultAccepted(true);
  };

  const handleAdultReject = () => {
    if (onBack) { onBack(); return; }
    navigate(-1);
  };
  // ─────────────────────────────────────────────────────────────────────────

  const [selectedSeason,   setSelectedSeason]   = useState<number>(initialSeason ?? (anime?.seasons[anime.seasons.length - 1]?.season ?? 1));
  const [selectedAudio,    setSelectedAudio]    = useState<AnimeType>(initialAudio);
  const [showTrailer,      setShowTrailer]      = useState(false);
  const [episodeSearch,    setEpisodeSearch]    = useState("");
  const [imgLoaded,        setImgLoaded]        = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  useEffect(() => {
    if (!anime) return;
    setSelectedSeason(initialSeason ?? anime.seasons[anime.seasons.length - 1].season);
    setSelectedAudio(initialAudio);
    setShowTrailer(false);
    setEpisodeSearch("");
    setImgLoaded(false);
    setSynopsisExpanded(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.title = `${anime.title} — AnimeVerse`;
    // Reset gate when anime changes
    setAdultAccepted(() => {
      try { return sessionStorage.getItem(`adult-ok:${animeId}`) === "yes"; }
      catch { return false; }
    });
  }, [animeId]);

  const relatedAnimes = useRelated(anime);
  const currentSeason = useMemo(() => anime?.seasons.find(s => s.season === selectedSeason), [anime, selectedSeason]);

  const episodes = useMemo(() => {
    if (!currentSeason) return [];
    if (currentSeason.episodeList?.length > 0) {
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
    ? selectedAudio
    : (availableAudios[0]?.type ?? "sub");

  const filteredEpisodes = useMemo(() => {
    if (!currentSeason) return [];
    const audioInfo = currentSeason.audios.find(a => a.type === effectiveAudio);
    const maxEp     = audioInfo?.episodesAvailable ?? 0;
    let list = episodes.filter(ep => ep.number <= maxEp && !!(ep.embeds as any)?.[effectiveAudio]);
    if (episodeSearch) list = list.filter(ep =>
      ep.title.toLowerCase().includes(episodeSearch.toLowerCase()) || String(ep.number).includes(episodeSearch)
    );
    return list;
  }, [episodes, episodeSearch, currentSeason, effectiveAudio]);

  const watchedCount = useMemo(
    () => filteredEpisodes.filter(ep => anime && isWatched(anime.id, ep.id)).length,
    [filteredEpisodes, anime, isWatched]
  );

  if (!anime || !currentSeason) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0a0a0a" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(124,58,237,0.3)", borderTopColor: "#7c3aed", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Carregando…</p>
          {onBack && (
            <button onClick={onBack} style={{ marginTop: 16, color: "#a78bfa", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
              ← Voltar
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Adult content gate — bloqueia renderização até aceitar ───────────────
  if (isAdult && !adultAccepted) {
    return (
      <AdultContentModal
        animeTitle={anime.title}
        onAccept={handleAdultAccept}
        onReject={handleAdultReject}
      />
    );
  }

  const seasonOptions: DropdownOption<number>[] = anime.seasons.map(s => ({
    value: s.season,
    label: (s as any).type === "movie" ? `🎬 ${s.seasonLabel}` : s.seasonLabel,
    badge: (s as any).type === "movie"
      ? ((s as any).runtime ? `${(s as any).runtime}min` : "Filme")
      : `${s.currentEpisode} eps`,
  }));

  const handleSeasonChange = (v: number) => {
    const target = anime.seasons.find(s => s.season === v);
    if ((target as any)?.type === "movie") {
      navigate(`/anime/${encodeURIComponent(anime.id)}/filme/${v}`);
      return;
    }
    setSelectedSeason(v);
    setEpisodeSearch("");
  };

  const audioOptions: DropdownOption<string>[] = currentSeason.audios.map(a => ({
    value: a.type, label: a.label, disabled: !a.available,
    badge: a.available ? `${a.episodesAvailable} eps` : "Indisponível",
  }));

  const status    = STATUS_CONFIG[currentSeason.status] ?? STATUS_CONFIG.finished;
  const progress  = Math.round((currentSeason.currentEpisode / (currentSeason.episodes || 1)) * 100);
  const youtubeId = getYoutubeId(currentSeason.trailer ?? "");

  const handleWatchNow = () => {
    const ep1 = filteredEpisodes[0];
    if (!ep1) return;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${ep1.id}?audio=${effectiveAudio}`);
  };

  const nextEpisode    = filteredEpisodes.find(ep => !isWatched(anime.id, ep.id));
  const handleContinue = () => {
    if (!nextEpisode) return;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${nextEpisode.id}?audio=${effectiveAudio}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "relative", height: "clamp(380px, 58vw, 600px)", overflow: "hidden", background: "#0d0d0d" }}>
          <motion.img
            src={anime.bannerImage || anime.coverImage}
            alt={anime.title}
            onLoad={() => setImgLoaded(true)}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: imgLoaded ? 1 : 0, scale: imgLoaded ? 1 : 1.04 }}
            transition={{ duration: 0.8 }}
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.38) saturate(1.1)" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.5) 50%, transparent 100%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.2) 50%, transparent 100%)" }} />
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
            opacity: 0.4, pointerEvents: "none",
          }} />

          {onBack && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              onClick={onBack}
              style={{
                position: "absolute", top: 20, left: 24,
                background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10,
                color: "rgba(255,255,255,0.75)", fontSize: 13, padding: "8px 14px",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              ← Voltar
            </motion.button>
          )}

          {/* Adult content badge on hero */}
          {isAdult && (
            <div style={{
              position: "absolute", top: 20, right: 24,
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.35)",
              borderRadius: 8, padding: "5px 11px",
              display: "flex", alignItems: "center", gap: 6,
              backdropFilter: "blur(8px)",
            }}>
              <span style={{ fontSize: 12 }}>🔞</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#f87171", textTransform: "uppercase" }}>
                18+
              </span>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: imgLoaded ? 1 : 0, x: imgLoaded ? 0 : 20 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            style={{
              position: "absolute", bottom: 32, right: "clamp(20px, 5vw, 72px)",
              width: 130, aspectRatio: "2/3", borderRadius: 12, overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)",
              display: "none",
            }}
            className="hero-cover"
          >
            <img src={anime.coverImage || anime.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </motion.div>
        </div>

        {/* Hero text overlay */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 clamp(20px, 5vw, 72px) 36px" }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${status.color}18`, border: `1px solid ${status.color}35`, borderRadius: 6, padding: "4px 10px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: status.color, display: "inline-block", animation: status.pulse ? "heroPulse 2s ease-in-out infinite" : "none" }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: status.color, textTransform: "uppercase" }}>{status.label}</span>
              </div>
              {anime.recommended && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  ⭐ Recomendado
                </span>
              )}
              {isAdult && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  🔞 Conteúdo adulto
                </span>
              )}
            </div>

            <h1 style={{ fontSize: "clamp(26px, 4.5vw, 54px)", fontWeight: 800, lineHeight: 1.05, color: "#fff", marginBottom: 4, letterSpacing: "-0.02em" }}>
              {anime.title}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 14, letterSpacing: "0.03em" }}>
              {anime.titleJapanese}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 18px", marginBottom: 14 }}>
              <span style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>✦ {currentSeason.score?.toFixed(1)}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{currentSeason.year}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{anime.studio}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{currentSeason.currentEpisode}/{currentSeason.episodes} eps</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {anime.genre.slice(0, 4).map((g: string) => (
                  <span key={g} style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 5, background: "rgba(124,58,237,0.14)", border: "1px solid rgba(124,58,237,0.25)", color: "rgba(167,139,250,0.85)" }}>
                    {g}
                  </span>
                ))}
              </div>
            </div>

            <p style={{
              fontSize: 13, lineHeight: 1.75, color: "rgba(255,255,255,0.6)", maxWidth: 580,
              display: "-webkit-box", WebkitLineClamp: synopsisExpanded ? "unset" : 2,
              WebkitBoxOrient: "vertical", overflow: synopsisExpanded ? "visible" : "hidden",
            }}>
              {currentSeason.synopsis}
            </p>
          </motion.div>
        </div>
      </div>

      {/* ── CONTROLS BAR ──────────────────────────────────────────────────── */}
      <div style={{ padding: "20px clamp(20px, 5vw, 72px)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        {anime.seasons.length > 1 && (
          <div style={{ minWidth: 190 }}>
            <CustomDropdown<number>
              label="Temporada"
              options={seasonOptions}
              value={selectedSeason}
              onChange={handleSeasonChange}
              size="md"
            />
          </div>
        )}

        <div style={{ minWidth: 210 }}>
          <CustomDropdown<string>
            label="Áudio"
            options={audioOptions}
            value={effectiveAudio}
            onChange={v => setSelectedAudio(v as AnimeType)}
            size="md"
          />
        </div>

        <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.06)", alignSelf: "center" }} />

        {watchedCount > 0 && nextEpisode ? (
          <button
            onClick={handleContinue}
            style={{
              height: 40, padding: "0 22px", borderRadius: 10,
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              color: "#fff", fontSize: 13, fontWeight: 600, border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
            }}
          >
            ▶ Continuar — Ep {nextEpisode.number}
          </button>
        ) : (
          <button
            onClick={handleWatchNow}
            disabled={filteredEpisodes.length === 0}
            style={{
              height: 40, padding: "0 22px", borderRadius: 10,
              background: filteredEpisodes.length > 0 ? "linear-gradient(135deg, #7c3aed, #6d28d9)" : "rgba(255,255,255,0.07)",
              color: filteredEpisodes.length > 0 ? "#fff" : "rgba(255,255,255,0.3)",
              fontSize: 13, fontWeight: 600, border: "none",
              cursor: filteredEpisodes.length > 0 ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              boxShadow: filteredEpisodes.length > 0 ? "0 4px 20px rgba(124,58,237,0.35)" : "none",
            }}
          >
            ▶ Assistir do início
          </button>
        )}

        <NotificationPanel
          animeId={animeId}
          animeTitle={anime.title}
          subscribed={subscribed}
          onToggle={() => toggleSubscription(animeId)}
        />

        {youtubeId && (
          <button
            onClick={() => setShowTrailer(p => !p)}
            style={{
              height: 40, padding: "0 18px", borderRadius: 10,
              background: showTrailer ? "rgba(124,58,237,0.12)" : "transparent",
              border: showTrailer ? "1px solid rgba(124,58,237,0.45)" : "1px solid rgba(255,255,255,0.1)",
              color: showTrailer ? "#c4b5fd" : "rgba(255,255,255,0.6)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              transition: "all 0.2s",
            }}
          >
            {showTrailer ? "✕ Fechar trailer" : "▷ Trailer"}
          </button>
        )}

        <WatchlistButton animeId={animeId} compact />
      </div>

      {/* ── TRAILER ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTrailer && youtubeId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden", padding: "0 clamp(20px, 5vw, 72px)" }}
          >
            <div style={{ position: "relative", paddingBottom: "56.25%", borderRadius: 14, overflow: "hidden", maxWidth: 860, marginTop: 24, marginBottom: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                title="Trailer"
                allow="autoplay; encrypted-media"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SYNOPSIS + STATS ──────────────────────────────────────────────── */}
      <div style={{ padding: "28px clamp(20px, 5vw, 72px)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "grid", gridTemplateColumns: "1fr auto", gap: "24px 40px" }}>
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
            Sinopse · {currentSeason.seasonLabel}
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: "rgba(255,255,255,0.68)", maxWidth: 680 }}>
            {currentSeason.synopsis}
          </p>
        </div>

        <div style={{ background: "#111318", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 22px", minWidth: 190, display: "flex", flexDirection: "column", gap: 14, alignSelf: "start" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>Progresso</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
              {currentSeason.currentEpisode}
              <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.35)" }}>/{currentSeason.episodes}</span>
            </p>
            <div style={{ marginTop: 8, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ delay: 0.6, duration: 0.9, ease: "easeOut" }}
                style={{ height: "100%", background: "linear-gradient(90deg, #7c3aed, #a855f7)", borderRadius: 4 }}
              />
            </div>
            <p style={{ marginTop: 5, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{progress}% lançado</p>
          </div>

          {watchedCount > 0 && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 5 }}>Assistidos</p>
              <p style={{ fontSize: 20, fontWeight: 700, color: "#4ade80", lineHeight: 1 }}>
                {watchedCount}
                <span style={{ fontSize: 12, fontWeight: 400, color: "rgba(74,222,128,0.5)" }}>/{filteredEpisodes.length}</span>
              </p>
              <div style={{ marginTop: 6, height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 4, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round((watchedCount / filteredEpisodes.length) * 100)}%` }}
                  transition={{ delay: 0.8, duration: 0.9, ease: "easeOut" }}
                  style={{ height: "100%", background: "linear-gradient(90deg, #22c55e, #4ade80)", borderRadius: 4 }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── EPISODE LIST ──────────────────────────────────────────────────── */}
      <div style={{ padding: "28px clamp(20px, 5vw, 72px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>Episódios</h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              {currentSeason.seasonLabel} · {effectiveAudio === "dub" ? "Dublado" : "Legendado"} · {filteredEpisodes.length} disponíveis
            </p>
          </div>

          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Buscar episódio…"
              value={episodeSearch}
              onChange={e => setEpisodeSearch(e.target.value)}
              style={{
                height: 36, padding: "0 36px 0 14px",
                background: "#111318", border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 9, color: "#fff", fontSize: 13, outline: "none",
                width: 200, transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,0.5)")}
              onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.09)")}
            />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", pointerEvents: "none", fontSize: 15 }}>⌕</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {filteredEpisodes.length === 0 ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, padding: "20px 0" }}>
              Nenhum episódio disponível.
            </motion.p>
          ) : (
            <motion.div
              key={`${selectedSeason}-${effectiveAudio}`}
              variants={{ animate: { transition: { staggerChildren: 0.025 } } }}
              initial="initial"
              animate="animate"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 8 }}
            >
              {filteredEpisodes.map(ep => {
                const watched = !!isWatched(anime.id, ep.id);
                return (
                  <EpisodeBtn
                    key={ep.id ?? ep.number}
                    episode={ep}
                    watched={watched}
                    isNext={nextEpisode?.id === ep.id && watchedCount > 0}
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

      {/* ── RELATED ───────────────────────────────────────────────────────── */}
      {relatedAnimes.length > 0 && (
        <div style={{ padding: "32px clamp(20px, 5vw, 72px) 64px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 4, letterSpacing: "-0.01em" }}>Você também pode gostar</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 20 }}>Baseado em {anime.title}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 14 }}>
            {relatedAnimes.map(related => (
              <AnimeCard key={related.id} anime={related} onClick={onAnimeClick} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes heroPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.75); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 768px) { .hero-cover { display: block !important; } }
      `}</style>
    </motion.div>
  );
}

// ── Episode Button ─────────────────────────────────────────────────────────────

function EpisodeBtn({ episode, watched, isNext, onPlay }: {
  episode: any; watched: boolean; isNext: boolean; onPlay: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const accentColor = isNext ? "#f59e0b" : watched ? "#22c55e" : "#7c3aed";
  const numberColor = hovered ? "#fff" : isNext ? "#fbbf24" : watched ? "#4ade80" : "rgba(255,255,255,0.4)";

  return (
    <motion.button
      variants={{ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } }}
      onClick={onPlay}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 13px", borderRadius: 10,
        width: "100%", textAlign: "left", cursor: "pointer",
        background: hovered ? `${accentColor}10` : isNext ? "rgba(245,158,11,0.05)" : watched ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.025)",
        border: hovered ? `1px solid ${accentColor}40` : isNext ? "1px solid rgba(245,158,11,0.3)" : watched ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.05)",
        transition: "all 0.15s",
      }}
    >
      {episode.thumbnail ? (
        <div style={{ width: 52, height: 38, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)", position: "relative" }}>
          <img src={episode.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {hovered && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>▶</div>}
          {watched && !hovered && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#4ade80", fontSize: 14 }}>✓</div>}
        </div>
      ) : (
        <span style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: hovered ? `${accentColor}20` : isNext ? "rgba(245,158,11,0.12)" : watched ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)",
          fontSize: hovered ? 13 : 12, fontWeight: 700, color: numberColor, transition: "all 0.15s",
        }}>
          {hovered ? "▶" : watched ? "✓" : isNext ? "▶" : episode.number}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: hovered ? "#fff" : watched ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color 0.15s" }}>
          {episode.title}
        </p>
        <p style={{ fontSize: 11, marginTop: 2, color: isNext ? "rgba(251,191,36,0.65)" : watched ? "rgba(74,222,128,0.6)" : "rgba(255,255,255,0.25)" }}>
          {isNext ? "▶ Continuar aqui" : watched ? "✓ Assistido" : `${episode.duration ?? 24} min`}
        </p>
      </div>

      {isNext && !hovered && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
          Next
        </span>
      )}
    </motion.button>
  );
}

export default AnimeDetailPage;