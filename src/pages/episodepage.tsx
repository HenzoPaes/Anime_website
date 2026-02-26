// src/pages/EpisodePage.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft, ChevronRight, List, Monitor, 
  CheckCircle2, Play, Search, Languages, Layers 
} from "lucide-react";

import { useAnime } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import { useEpisodeHistory } from "../hooks/useepisodehistory";
import EpisodePlayer from "../components/episodeplayer";
import AudioBadge from "../components/audiobadge";
import WatchlistButton from "../components/watchlistbutton";
import PageLoader from "../components/pageloader";

export default function EpisodePage() {
  const { id, epId } = useParams<{ id: string; epId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  const { anime, loading } = useAnime(decodeURIComponent(id!));
  const { markEpisode, isWatched, unmarkEpisode } = useWatched();
  const { addToHistory } = useEpisodeHistory();

  const [cinemaMode, setCinemaMode] = useState(false);
  const [epSearch, setEpSearch] = useState("");
  const [activeSeason, setActiveSeason] = useState<number>(1);

  // 1. Lógica de Áudio (Melhorada)
  const currentAudio = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("audio") || "sub"; // 'sub' (legendado) ou 'dub' (dublado)
  }, [location.search]);

  const changeAudio = (type: "sub" | "dub") => {
    const params = new URLSearchParams(location.search);
    params.set("audio", type);
    navigate({ search: params.toString() }, { replace: true });
  };

  // 2. Encontrar Episódio e Agrupar Temporadas
  const episode = useMemo(() => anime?.episodes.find(e => e.id === epId), [anime, epId]);
  
  const seasons = useMemo(() => {
    if (!anime?.episodes) return {};
    return anime.episodes.reduce((acc: any, ep: any) => {
      const s = ep.season || 1;
      if (!acc[s]) acc[s] = [];
      acc[s].push(ep);
      return acc;
    }, {});
  }, [anime]);

  const seasonNumbers = useMemo(() => Object.keys(seasons).map(Number).sort((a, b) => a - b), [seasons]);

  // Atualiza temporada ativa ao carregar o ep
  useEffect(() => {
    if (episode?.season) setActiveSeason(episode.season);
  }, [episode]);

  // 3. Fonte do Embed Dinâmica
  const embedSrc = useMemo(() => {
    if (!episode) return "";
    const embeds = (episode as any).embeds || {};
    // Prioridade: Áudio selecionado -> Fallback para o que existir
    return embeds[currentAudio] || embeds.sub || embeds.dub || (episode as any).embedUrl || "";
  }, [episode, currentAudio]);

  // 4. Navegação (Anterior/Próximo)
  const epIdx = useMemo(() => anime?.episodes.findIndex(e => e.id === epId) ?? -1, [anime, epId]);
  const prevEp = anime?.episodes[epIdx - 1];
  const nextEp = anime?.episodes[epIdx + 1];

  const navTo = useCallback((ep: any) => {
    if (!ep || !anime) return;
    navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}?audio=${currentAudio}`);
  }, [anime, currentAudio, navigate]);

  // Histórico e Auto-Watch
  useEffect(() => {
    if (anime && episode) {
      document.title = `Ep. ${episode.number} - ${anime.title}`;
      addToHistory({
        animeId: anime.id, animeTitle: anime.title, animeCover: anime.cover,
        epId: episode.id, epTitle: episode.title, epNumber: episode.number,
        audio: currentAudio, watchedAt: Date.now(),
      });
      const t = setTimeout(() => markEpisode(anime.id, episode.id), 45000);
      return () => clearTimeout(t);
    }
  }, [anime?.id, episode?.id, currentAudio]);

  if (loading) return <PageLoader />;
  if (!anime || !episode) return <ErrorState id={id!} />;

  const watched = isWatched(anime.id, episode.id);

  return (
    <div className={`min-h-screen bg-dark-950 transition-colors duration-500 ${cinemaMode ? "bg-black" : ""}`}>
      
      {/* Luzes apagadas (Overlay) */}
      <AnimatePresence>
        {cinemaMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-40 pointer-events-none" />
        )}
      </AnimatePresence>

      <div className={`max-w-[1600px] mx-auto px-4 py-4 md:py-8 relative z-50`}>
        
        {/* Header de Navegação Superior */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-gray-500 hover:text-white transition-colors">Início</Link>
            <ChevronRight className="w-4 h-4 text-gray-700" />
            <Link to={`/anime/${encodeURIComponent(anime.id)}`} className="text-gray-500 hover:text-white font-medium truncate max-w-[150px]">
              {anime.title}
            </Link>
            <ChevronRight className="w-4 h-4 text-gray-700" />
            <span className="text-brand-400 font-bold">Episódio {episode.number}</span>
          </nav>

          <div className="flex items-center gap-2">
             <WatchlistButton animeId={anime.id} compact />
             <button onClick={() => setCinemaMode(!cinemaMode)} 
               className={`p-2 rounded-lg transition-all ${cinemaMode ? "bg-brand-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
               <Monitor className="w-5 h-5" />
             </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* COLUNA ESQUERDA: Player e Infos */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            
            {/* Player Container */}
            <section className="bg-black rounded-2xl overflow-hidden shadow-2xl shadow-brand-500/5 group relative">
              <EpisodePlayer episode={{ ...episode, embedUrl: embedSrc }} animeTitle={anime.title} />
            </section>

            {/* Ações do Player */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
              <div className="flex items-center gap-4">
                {/* Seletor de Áudio */}
                <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                  <button onClick={() => changeAudio("sub")}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2
                    ${currentAudio === "sub" ? "bg-brand-500 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}>
                    <Languages className="w-3.5 h-3.5" /> LEG
                  </button>
                  <button onClick={() => changeAudio("dub")}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2
                    ${currentAudio === "dub" ? "bg-brand-500 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}>
                    <Languages className="w-3.5 h-3.5" /> DUB
                  </button>
                </div>

                <button onClick={() => watched ? unmarkEpisode(anime.id, episode.id) : markEpisode(anime.id, episode.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all
                  ${watched ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-white/5 text-gray-400 border border-transparent hover:border-white/10"}`}>
                  <CheckCircle2 className="w-4 h-4" />
                  {watched ? "Assistido" : "Marcar como visto"}
                </button>
              </div>

              {/* Navegação Rápida */}
              <div className="flex items-center gap-2">
                <button disabled={!prevEp} onClick={() => navTo(prevEp)}
                  className="p-3 rounded-xl bg-white/5 border border-white/5 text-gray-300 disabled:opacity-20 hover:bg-brand-500 hover:text-white transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button disabled={!nextEp} onClick={() => navTo(nextEp)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 text-white font-bold disabled:opacity-20 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-500/20">
                  Próximo <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Info do Episódio */}
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-display font-bold text-white leading-tight">
                {episode.number}. {episode.title}
              </h1>
              <div className="flex items-center gap-3 text-gray-400 text-sm">
                <span className="flex items-center gap-1.5 text-brand-400 font-semibold italic">
                  <Play className="w-3.5 h-3.5 fill-current" /> {anime.title}
                </span>
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                <span>{episode.embedCredit || "Fonte Principal"}</span>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA: Playlist / Temporadas */}
          <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col h-[750px]">
              
              {/* Header da Sidebar */}
              <div className="p-4 border-b border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-white font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-brand-400" /> Episódios
                  </h2>
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 bg-white/5 px-2 py-1 rounded">
                    {anime.episodes.length} Total
                  </span>
                </div>

                {/* Tabs de Temporada */}
                {seasonNumbers.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {seasonNumbers.map(s => (
                      <button key={s} onClick={() => setActiveSeason(s)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all
                        ${activeSeason === s ? "bg-brand-500 text-white shadow-md" : "bg-white/5 text-gray-500 hover:text-gray-300"}`}>
                        T{s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Busca Local */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input type="text" placeholder="Buscar episódio..." value={epSearch} onChange={e => setEpSearch(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-brand-500 outline-none transition-all" />
                </div>
              </div>

              {/* Lista de Episódios */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {seasons[activeSeason]?.filter((ep: any) => 
                   ep.title.toLowerCase().includes(epSearch.toLowerCase()) || String(ep.number).includes(epSearch)
                ).map((ep: any) => {
                  const isCurrent = ep.id === epId;
                  const epWatched = isWatched(anime.id, ep.id);
                  
                  return (
                    <button key={ep.id} onClick={() => navTo(ep)}
                      className={`w-full group flex items-center gap-4 p-3 rounded-xl transition-all relative overflow-hidden
                      ${isCurrent ? "bg-brand-500/10 ring-1 ring-brand-500/50" : "hover:bg-white/5"}`}>
                      
                      <div className="relative flex-shrink-0 w-20 h-12 rounded-lg overflow-hidden bg-dark-800">
                        {/* Se tiver thumbnail no JSON, use aqui, senão use o cover do anime */}
                        <img src={anime.cover} className="w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform" alt="" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          {isCurrent ? <Play className="w-5 h-5 text-brand-400 fill-current" /> : <span className="text-xs font-bold text-white">{ep.number}</span>}
                        </div>
                        {epWatched && !isCurrent && (
                          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5 shadow-lg">
                            <CheckCircle2 className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 text-left">
                        <h4 className={`text-sm font-bold truncate ${isCurrent ? "text-brand-400" : "text-gray-300 group-hover:text-white"}`}>
                          {ep.title}
                        </h4>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">
                          Temporada {ep.season || 1} • Ep {ep.number}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ id }: { id: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
      <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
        <Layers className="w-12 h-12 text-red-500" />
      </div>
      <h2 className="text-3xl font-display font-bold text-white mb-2">Ops! Episódio perdido</h2>
      <p className="text-gray-400 max-w-md mb-8">Não conseguimos encontrar os detalhes deste episódio. Ele pode ter sido removido ou o link está quebrado.</p>
      <Link to={`/anime/${id}`} className="px-8 py-3 bg-brand-500 text-white rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-brand-500/25">
        Voltar para o Anime
      </Link>
    </div>
  );
}