import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAnime, useAnimes } from "../hooks/useAnimes";
import { useWatched } from "../hooks/useWatchlist";
import AudioBadge from "../components/AudioBadge";
import WatchlistButton from "../components/WatchlistButton";
import PageLoader from "../components/PageLoader";
import AnimeCard from "../components/AnimeCard";
import { Episode } from "../types";

const PAGE = { initial:{opacity:0,y:20}, animate:{opacity:1,y:0,transition:{duration:0.35}}, exit:{opacity:0,y:-20} };
const STATUS_LABEL: Record<string,string> = { "em-andamento":"Em andamento", completo:"Completo", pausado:"Pausado", cancelado:"Cancelado" };
const STATUS_COLOR: Record<string,string> = { "em-andamento":"text-green-400", completo:"text-blue-400", pausado:"text-yellow-400", cancelado:"text-red-400" };
const ITEMS = 12;

export default function AnimeDetailPage() {
  const { id } = useParams<{id:string}>();
  const { anime, loading, error } = useAnime(decodeURIComponent(id!));
  const { animes } = useAnimes();
  const { markEpisode, unmarkEpisode, isWatched, getWatchedCount } = useWatched();
  const [epPage, setEpPage] = useState(0);
  const [epSearch, setEpSearch] = useState("");
  const [tab, setTab] = useState<"episodios"|"relacionados">("episodios");
  const navigate = useNavigate();

  useEffect(()=>{ if(anime) document.title = `${anime.title} — AnimeVerse`; }, [anime]);

  const filteredEps = useMemo(()=>
    (anime?.episodes||[]).filter(ep=>ep.title.toLowerCase().includes(epSearch.toLowerCase())||String(ep.number).includes(epSearch)),
  [anime,epSearch]);
  const totalPages = Math.ceil(filteredEps.length/ITEMS);
  const pagedEps   = filteredEps.slice(epPage*ITEMS,(epPage+1)*ITEMS);

  // Related: same genre or keywords
  const related = useMemo(()=>{
    if (!anime) return [];
    return animes.filter(a=>a.id!==anime.id && (a.genres||[]).some(g=>(anime.genres||[]).includes(g))).slice(0,6);
  }, [animes,anime]);

  const watchedCount = anime ? getWatchedCount(anime.id) : 0;

  if (loading) return <PageLoader/>;
  if (error||!anime) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-red-400 text-xl">Anime não encontrado.</p>
      <Link to="/" className="btn-primary">← Voltar</Link>
    </div>
  );

  const EpRow = ({ ep, idx }:{ ep:Episode; idx:number }) => {
    const watched = isWatched(anime.id, ep.id);
    return (
      <motion.div initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:idx*0.025}}
        className={`flex items-center gap-3 p-3 rounded-xl transition-all group border ${watched?"bg-brand-500/5 border-brand-500/20":"bg-white/[0.02] border-transparent hover:bg-white/5 hover:border-white/10"}`}>
        <button onClick={e=>{e.stopPropagation();watched?unmarkEpisode(anime.id,ep.id):markEpisode(anime.id,ep.id);}}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
            ${watched?"bg-brand-500 border-brand-500":"border-gray-600 group-hover:border-brand-500"}`}>
          {watched&&<svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>}
        </button>
        <span className="w-8 text-center text-xs font-mono font-bold text-gray-500">{String(ep.number).padStart(2,"0")}</span>
        <Link to={`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}`}
          onClick={()=>markEpisode(anime.id,ep.id)}
          className="flex-1 font-semibold text-sm text-white hover:text-brand-300 transition-colors">{ep.title}</Link>
        {ep.embedCredit && <span className="hidden sm:block text-xs text-gray-600 bg-white/5 px-2 py-0.5 rounded-full flex-shrink-0">{ep.embedCredit}</span>}
        <Link to={`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}`}
          className="btn-primary py-1 px-3 text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Assistir
        </Link>
      </motion.div>
    );
  };

  return (
    <motion.div variants={PAGE} initial="initial" animate="animate" exit="exit">
      {/* Banner with blur effect */}
      <div className="relative h-64 md:h-96 overflow-hidden">
        {/* Blur bg */}
        <div className="absolute inset-0 scale-110">
          <img src={anime.banner||anime.cover} alt="" className="w-full h-full object-cover blur-md opacity-60" />
        </div>
        {/* Sharp foreground */}
        <img src={anime.banner||anime.cover} alt="" className="absolute inset-0 w-full h-full object-cover object-top opacity-50"
          onError={e=>{(e.target as HTMLImageElement).src=anime.cover;}} />
        <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-dark-900/50 to-transparent" />
        <button onClick={()=>navigate(-1)} className="absolute top-4 left-4 btn-ghost py-1.5 px-3 text-sm">← Voltar</button>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-32 pb-16">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Cover + stats sidebar */}
          <div className="flex-shrink-0">
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} transition={{delay:0.2}}>
              <img src={anime.cover} alt={`Capa de ${anime.title}`}
                className="relative z-20 w-44 mx-auto md:mx-0 aspect-[2/3] object-cover rounded-xl shadow-2xl border-2 border-dark-700 card-glow"
                onError={e=>{(e.target as HTMLImageElement).src=`https://placehold.co/300x450/1a1a27/f43f5e?text=${encodeURIComponent(anime.title.slice(0,10))}`;}} />
            </motion.div>

            <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
              className="mt-4 glass rounded-xl p-4 space-y-3 text-sm w-44 mx-auto md:mx-0">
              {[
                ["Nota", <span className="font-bold text-yellow-400">★ {anime.rating?.toFixed(1)??'—'}</span>],
                ["Status", <span className={`font-semibold text-xs ${STATUS_COLOR[anime.status]??""}`}>{STATUS_LABEL[anime.status]??anime.status}</span>],
                ["Ano",  <span className="font-semibold">{anime.year??"—"}</span>],
                ["Total",<span className="font-semibold">{anime.episodeCount} eps</span>],
                ["Disponíveis",<span className="font-semibold text-brand-400">{anime.episodes.length}</span>],
              ].map(([label,value])=>(
                <div key={label as string} className="flex items-center justify-between">
                  <span className="text-gray-500">{label as string}</span>
                  <span>{value as React.ReactNode}</span>
                </div>
              ))}
              {anime.episodes.length>0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">Progresso</span>
                    <span>{watchedCount}/{anime.episodes.length}</span>
                  </div>
                  <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-brand-500 rounded-full" initial={{width:0}}
                      animate={{width:`${(watchedCount/anime.episodes.length)*100}%`}} transition={{delay:0.5,duration:0.6}}/>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Áudio</span>
                <AudioBadge type={anime.audioType} size="sm"/>
              </div>
            </motion.div>
          </div>

          {/* Info */}
          <motion.div className="flex-1 pt-4 md:pt-36" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.1}}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <AudioBadge type={anime.audioType}/>
              {anime.status && (
                <span className={`badge border ${STATUS_COLOR[anime.status]??""} bg-white/5 border-white/10`}>
                  {STATUS_LABEL[anime.status]??anime.status}
                </span>
              )}
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-white tracking-wide mb-1">
              {anime.title}
              {anime.recommended && (
               <span className="ml-3 px-4 py-1 rounded-lg text-sm font-semibold bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-300 text-yellow-900 shadow-[0_0_12px_rgba(255,215,0,0.6)]">
                  ✨ {anime.recommendationReason || "Recomendado"}
               </span>
              )}
            </h1>
            {anime.alt_titles?.length>0 && <p className="text-gray-500 text-sm mb-4">Também: {anime.alt_titles.join(" / ")}</p>}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-5 pb-5 border-b border-white/5">
              {anime.episodes.length>0 && (
                <Link to={`/anime/${encodeURIComponent(anime.id)}/ep/${anime.episodes[0].id}`}
                  className="btn-primary flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  {watchedCount>0?"Continuar":"Assistir"}
                </Link>
              )}
              <WatchlistButton animeId={anime.id}/>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-5">
              {anime.rating && <span className="text-yellow-400 font-bold">★ {anime.rating.toFixed(1)}</span>}
              {anime.year && <span>📅 {anime.year}</span>}
              <span>📺 {anime.episodeCount} eps total</span>
              <span>{anime.audioType==="legendado"?"💬 Legendado":anime.audioType==="dublado"?"🎙️ Dublado":"🎧 Dual-Audio"}</span>
            </div>

            {anime.synopsis && (
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Sinopse</p>
                <p className="text-gray-300 leading-relaxed text-sm">{anime.synopsis}</p>
              </div>
            )}
            {anime.genres?.length>0 && (
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Gêneros</p>
                <div className="flex flex-wrap gap-2">
                  {anime.genres.map(g=><span key={g} className="text-sm bg-white/5 border border-white/10 rounded-full px-3 py-1 text-gray-300 capitalize">{g}</span>)}
                </div>
              </div>
            )}
            {anime.tags?.length>0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {anime.tags.map(t=><span key={t} className="text-xs bg-brand-500/10 border border-brand-500/20 rounded-full px-2.5 py-0.5 text-brand-400">#{t}</span>)}
                </div>
              </div>
            )}
          </motion.div>
        </div>

        {/* Sub tabs */}
        <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.4}} className="mt-12">
          <div className="flex gap-1 mb-6 glass rounded-xl p-1 w-fit">
            {([["episodios","📺 Episódios"],["relacionados","🔗 Relacionados"]] as const).map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`py-2 px-5 rounded-lg text-sm font-bold transition-all ${tab===t?"bg-brand-500 text-white":"text-gray-400 hover:text-white"}`}>{l}</button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {tab==="episodios" && (
              <motion.div key="eps" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <h2 className="font-display text-2xl text-white tracking-wide">
                    Episódios <span className="text-base text-gray-500 font-body font-normal">({anime.episodes.length} de {anime.episodeCount})</span>
                  </h2>
                  <input type="text" value={epSearch} onChange={e=>{setEpSearch(e.target.value);setEpPage(0);}}
                    placeholder="Filtrar…" className="input-field text-sm w-full sm:w-56 py-1.5"/>
                </div>
                <div className="space-y-1.5">
                  <AnimatePresence mode="wait">
                    {pagedEps.length>0
                      ? pagedEps.map((ep,i)=><EpRow key={ep.id} ep={ep} idx={i}/>)
                      : <motion.p initial={{opacity:0}} animate={{opacity:1}} className="text-center text-gray-500 py-8">Nenhum episódio encontrado.</motion.p>
                    }
                  </AnimatePresence>
                </div>
                {totalPages>1 && (
                  <div className="flex items-center justify-center gap-3 mt-6">
                    <button onClick={()=>setEpPage(p=>Math.max(0,p-1))} disabled={epPage===0} className="btn-ghost py-1.5 px-4 text-sm disabled:opacity-40">← Anterior</button>
                    <span className="text-sm text-gray-500">{epPage+1} / {totalPages}</span>
                    <button onClick={()=>setEpPage(p=>Math.min(totalPages-1,p+1))} disabled={epPage>=totalPages-1} className="btn-ghost py-1.5 px-4 text-sm disabled:opacity-40">Próxima →</button>
                  </div>
                )}
              </motion.div>
            )}
            {tab==="relacionados" && (
              <motion.div key="rel" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                {related.length>0 ? (
                  <>
                    <p className="text-gray-500 text-sm mb-4">Animes com gêneros similares:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {related.map((a,i)=><AnimeCard key={a.id} anime={a} index={i}/>)}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-3xl mb-3">🔍</p>
                    <p>Nenhum anime relacionado encontrado.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
}
