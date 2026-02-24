import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAnime } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import EpisodePlayer from "../components/episodeplayer";
import AudioBadge from "../components/audiobadge";
import WatchlistButton from "../components/WatchlistButton";
import PageLoader from "../components/pageloader";

const PAGE = { initial:{opacity:0,x:24}, animate:{opacity:1,x:0,transition:{duration:0.3}}, exit:{opacity:0,x:-24,transition:{duration:0.2}} };

export default function EpisodePage() {
  const { id, epId } = useParams<{id:string;epId:string}>();
  const { anime, loading } = useAnime(decodeURIComponent(id!));
  const { markEpisode, isWatched, unmarkEpisode } = useWatched();
  const navigate = useNavigate();
  const [cinemaMode, setCinemaMode] = useState(false);
  const [epSearch, setEpSearch] = useState("");

  const episode  = useMemo(()=>anime?.episodes.find(e=>e.id===epId), [anime,epId]);
  const epIdx    = useMemo(()=>anime?.episodes.findIndex(e=>e.id===epId)??-1, [anime,epId]);

  const location = useLocation();
  const requestedAudio = useMemo(() => {
    try { return new URLSearchParams(location.search).get("audio") || undefined; }
    catch { return undefined; }
  }, [location.search]);

  // pega URL de embed de acordo com o formato atual ou antigo e, quando
  // informado, prioriza o `audio` pedido via query param (ex: ?audio=dub)
  const embedSrc = useMemo(() => {
    if (!episode) return "";
    // legacy field
    if ((episode as any).embedUrl) return (episode as any).embedUrl;
    // nova estrutura
    const embeds = (episode as any).embeds || {};
    if (requestedAudio && (embeds as any)[requestedAudio]) return (embeds as any)[requestedAudio];
    return embeds.sub || embeds.dub || "";
  }, [episode, requestedAudio]);
  const prevEp   = useMemo(()=>epIdx>0?anime?.episodes[epIdx-1]:null, [anime,epIdx]);
  const nextEp   = useMemo(()=>anime&&epIdx<anime.episodes.length-1?anime.episodes[epIdx+1]:null, [anime,epIdx]);

  const filteredEps = useMemo(()=>
    anime?.episodes.filter(ep=>ep.title.toLowerCase().includes(epSearch.toLowerCase())||String(ep.number).includes(epSearch)) ?? [],
  [anime,epSearch]);

  useEffect(()=>{
    if (anime&&episode) {
      document.title = `${episode.title} — ${anime.title} | AnimeVerse`;
      const t = setTimeout(()=>markEpisode(anime.id,episode.id), 30000);
      return ()=>clearTimeout(t);
    }
  }, [anime,episode]);

  const handleKey = useCallback((e:KeyboardEvent)=>{
    if (e.key==="ArrowLeft"&&prevEp&&anime) {
      const path = requestedAudio ? `/anime/${encodeURIComponent(anime.id)}/ep/${prevEp.id}?audio=${requestedAudio}` : `/anime/${encodeURIComponent(anime.id)}/ep/${prevEp.id}`;
      navigate(path);
    }
    if (e.key==="ArrowRight"&&nextEp&&anime) {
      const path = requestedAudio ? `/anime/${encodeURIComponent(anime.id)}/ep/${nextEp.id}?audio=${requestedAudio}` : `/anime/${encodeURIComponent(anime.id)}/ep/${nextEp.id}`;
      navigate(path);
    }
    if (e.key==="c"||e.key==="C") setCinemaMode(v=>!v);
    if (e.key==="Escape") setCinemaMode(false);
  }, [prevEp,nextEp,anime]);

  useEffect(()=>{ window.addEventListener("keydown",handleKey); return ()=>window.removeEventListener("keydown",handleKey); }, [handleKey]);

  if (loading) return <PageLoader/>;
  if (!anime||!episode) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-red-400 text-xl">Episódio não encontrado.</p>
      <Link to={`/anime/${id}`} className="btn-primary">← Voltar ao anime</Link>
    </div>
  );

  const watched = isWatched(anime.id, episode.id);

  return (
    <>
      {/* Cinema overlay */}
      <AnimatePresence>
        {cinemaMode && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/90 z-40 cursor-pointer"
            onClick={()=>setCinemaMode(false)} />
        )}
      </AnimatePresence>

      <motion.div variants={PAGE} initial="initial" animate="animate" exit="exit"
        className={`max-w-7xl mx-auto px-4 py-6 ${cinemaMode?"relative z-50":""}`}>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-5 flex-wrap">
          <Link to="/" className="hover:text-brand-400 transition-colors">Início</Link>
          <span>/</span>
          <Link to={`/anime/${encodeURIComponent(anime.id)}`} className="hover:text-brand-400 transition-colors truncate max-w-[200px]">{anime.title}</Link>
          <span>/</span>
          <span className="text-gray-300">Ep. {episode.number}</span>
        </nav>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Player area */}
          <div className="flex-1 min-w-0">
            <div className="mb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-brand-400 font-bold bg-brand-500/10 px-2 py-0.5 rounded">EP {String(episode.number).padStart(2,"0")}</span>
                    <AudioBadge type={anime.audioType} size="sm" />
                  </div>
                  <h1 className="font-display text-2xl md:text-3xl text-white">{episode.title}</h1>
                  <p className="text-gray-500 text-sm">{anime.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <WatchlistButton animeId={anime.id} compact />
                  {/* Cinema mode toggle */}
                  <button onClick={()=>setCinemaMode(v=>!v)}
                    className={`btn-ghost py-1.5 px-3 text-xs flex items-center gap-1.5 ${cinemaMode?"border-brand-500 text-brand-400":""}`}
                    title="Modo cinema (C)">
                    🎬 {cinemaMode?"Sair do cinema":"Cinema"}
                  </button>
                  <button
                    onClick={()=>watched?unmarkEpisode(anime.id,episode.id):markEpisode(anime.id,episode.id)}
                    className={`flex items-center gap-2 py-2 px-4 rounded-lg border text-sm font-semibold transition-all
                      ${watched?"bg-brand-500/20 border-brand-500 text-brand-300":"bg-white/5 border-white/10 text-gray-400 hover:border-brand-500"}`}>
                    {watched?"✓ Visto":"Marcar visto"}
                  </button>
                </div>
              </div>
            </div>

            <EpisodePlayer
              episode={{ ...episode, embedUrl: embedSrc }}
              animeTitle={anime.title}
            />

            <p className="text-xs text-gray-700 mt-2 text-center">← → mudar ep • C = modo cinema</p>

            {/* Prev/Next */}
            <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.35}} className="flex items-center gap-3 mt-6">
              {prevEp
                ? <Link to={requestedAudio ? `/anime/${encodeURIComponent(anime.id)}/ep/${prevEp.id}?audio=${requestedAudio}` : `/anime/${encodeURIComponent(anime.id)}/ep/${prevEp.id}`} className="flex-1 btn-ghost flex items-center gap-2 justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                    <span className="text-sm"><span className="text-gray-500 text-xs block">Anterior</span>Ep. {prevEp.number}</span>
                  </Link>
                : <div className="flex-1"/>
              }
              <Link to={`/anime/${encodeURIComponent(anime.id)}`} className="btn-ghost p-2 flex-shrink-0" title="Lista de episódios">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
              </Link>
              {nextEp
                ? <Link to={requestedAudio ? `/anime/${encodeURIComponent(anime.id)}/ep/${nextEp.id}?audio=${requestedAudio}` : `/anime/${encodeURIComponent(anime.id)}/ep/${nextEp.id}`} className="flex-1 btn-primary flex items-center gap-2 justify-center">
                    <span className="text-sm"><span className="text-gray-200 text-xs block">Próximo</span>Ep. {nextEp.number}</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                  </Link>
                : <div className="flex-1 text-center text-sm text-gray-600 glass rounded-lg p-2">Último disponível</div>
              }
            </motion.div>
          </div>

          {/* Episode list sidebar */}
          <motion.aside initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} transition={{delay:0.2}} className="xl:w-80 xl:flex-shrink-0">
            <div className="glass rounded-xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-white text-sm">Episódios</h2>
                  <p className="text-xs text-gray-500">{anime.episodes.length} de {anime.episodeCount} disponíveis</p>
                </div>
              </div>
              <div className="px-3 py-2 border-b border-white/5">
                <input type="text" value={epSearch} onChange={e=>setEpSearch(e.target.value)}
                  placeholder="Filtrar episódios…" className="input-field text-xs py-1.5" />
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredEps.map(ep=>{
                  const isCurrent = ep.id===epId;
                  const epWatched = isWatched(anime.id,ep.id);
                  return (
                    <Link key={ep.id} to={requestedAudio ? `/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}?audio=${requestedAudio}` : `/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}`}
                      className={`flex items-center gap-3 px-4 py-3 transition-all border-b border-white/5 last:border-0
                        ${isCurrent?"bg-brand-500/20 border-l-2 border-l-brand-500":"hover:bg-white/5"}`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0
                        ${isCurrent?"bg-brand-500 animate-pulse":epWatched?"bg-green-500":"bg-dark-600"}`}/>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isCurrent?"text-brand-300":epWatched?"text-gray-400":"text-white"}`}>
                          Ep. {ep.number} — {ep.title}
                        </p>
                        {ep.embedCredit && <p className="text-xs text-gray-600 truncate">{ep.embedCredit}</p>}
                      </div>
                      {isCurrent && <svg className="w-4 h-4 text-brand-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                    </Link>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        </div>
      </motion.div>
    </>
  );
}
