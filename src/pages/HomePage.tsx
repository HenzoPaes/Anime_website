import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useAnimes } from "../hooks/useanimes";
import { useWatched, useWatchlist, WATCHLIST_LABELS, WATCHLIST_COLORS } from "../hooks/usewatchlist";
import type { WatchStatus } from "../hooks/usewatchlist";
import AnimeCard from "../components/animecard";
import SkeletonCard from "../components/skeletoncard";
import SearchBar from "../components/searchbar";
import AudioBadge from "../components/audiobadge";
import CustomDropdown, { DropdownOption } from "../components/customdropdown";

const PAGE = { initial:{opacity:0}, animate:{opacity:1,transition:{duration:0.3}}, exit:{opacity:0} };
const WL_STATUSES: WatchStatus[] = ["assistindo","quero-ver","concluido","droppado"];

const sortOptions: DropdownOption<string>[] = [
  { value: "rating", label: "Melhor avaliados" },
  { value: "newest",  label: "Mais recentes" },
  { value: "episodes",label: "Mais episódios" },
  { value: "title",   label: "Título A-Z" },
];

export default function HomePage() {
  const { animes, loading, error } = useAnimes();
  const { getWatchedCount } = useWatched();
  const { list: wlList, getByStatus } = useWatchlist();
  const navigate = useNavigate();

  const [mainTab, setMainTab] = useState<"catalogo"|"minha-lista">("catalogo");
  const [wlTab, setWlTab] = useState<WatchStatus>("assistindo");
  const [sortBy, setSortBy] = useState("rating");
  const [audioF, setAudioF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [selGenres, setSelGenres] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [randFlash, setRandFlash] = useState(false);

  const featured = useMemo(() => animes.length ? [...animes].filter(a=>a.rating).sort((a,b)=>(b.rating??0)-(a.rating??0))[0] : null, [animes]);
  const allGenres = useMemo(() => { const s=new Set<string>(); animes.forEach(a=>(a.genres||[]).forEach(g=>s.add(g))); return Array.from(s).sort(); }, [animes]);
  const activeFilters = [audioF,statusF,...selGenres,minRating>0?"r":""].filter(Boolean).length;

  const catalogAnimes = useMemo(() => {
    let list = [...animes];
    if (audioF) list = list.filter(a=>a.audioType===audioF);
    if (statusF) list = list.filter(a=>a.status===statusF);
    if (selGenres.length) list = list.filter(a=>selGenres.every(g=>(a.genres||[]).includes(g)));
    if (minRating>0) list = list.filter(a=>(a.rating??0)>=minRating);
    if (sortBy==="rating") list.sort((a,b)=>(b.rating??0)-(a.rating??0));
    else if (sortBy==="newest") list.sort((a,b)=>(b.year??0)-(a.year??0));
    else if (sortBy==="title") list.sort((a,b)=>a.title.localeCompare(b.title));
    else if (sortBy==="episodes") list.sort((a,b)=>b.episodeCount-a.episodeCount);
    return list;
  }, [animes,audioF,statusF,selGenres,minRating,sortBy]);

  const wlAnimes = useMemo(() => {
    const ids = getByStatus(wlTab);
    return ids.map(id=>animes.find(a=>a.id===id)).filter(Boolean) as typeof animes;
  }, [animes,wlTab,wlList]);

  useEffect(() => { document.title = "AnimeVerse — Seu portal de animes"; }, []);

  const handleRandom = useCallback(() => {
    if (!animes.length) return;
    const candidates = animes.filter(a=>a.rating && a.rating>=7);
    const pick = candidates[Math.floor(Math.random()*candidates.length)] || animes[Math.floor(Math.random()*animes.length)];
    setRandFlash(true);
    setTimeout(()=>{ setRandFlash(false); navigate(`/anime/${encodeURIComponent(pick.id)}`); }, 500);
  }, [animes, navigate]);

  return (
    <motion.div variants={PAGE} initial="initial" animate="animate" exit="exit">
      {/* Hero */}
      {featured && !loading && (
        <section className="relative overflow-hidden min-h-[420px] flex items-end">
          <div className="absolute inset-0">
            <img src={featured.banner||featured.cover} alt="" className="w-full h-full object-cover scale-110 blur-sm opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-dark-900 via-dark-900/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-16 w-full">
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}} className="flex items-center gap-2 mb-3">
              <span className="badge bg-brand-500/20 text-brand-400 border border-brand-500/30">⭐ Melhor avaliado</span>
              <AudioBadge type={featured.audioType} />
            </motion.div>
            <motion.h1 initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
              className="font-display text-5xl md:text-7xl text-white mb-3 leading-none tracking-wide max-w-2xl">{featured.title}</motion.h1>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.4}}
              className="flex flex-wrap items-center gap-3 mb-4 text-sm text-gray-400">
              <span className="text-yellow-400 font-bold">★ {featured.rating?.toFixed(1)}</span>
              {featured.year && <><span>{featured.year}</span><span>•</span></>}
              <span>{featured.episodeCount} episódios</span>
              {featured.genres?.slice(0,3).map(g=><span key={g} className="capitalize bg-white/10 px-2 py-0.5 rounded-full text-xs">{g}</span>)}
            </motion.div>
            {featured.synopsis && (
              <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.45}}
                className="text-gray-300 text-sm line-clamp-2 mb-6 max-w-xl">{featured.synopsis}</motion.p>
            )}
            <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.5}} className="flex gap-3 flex-wrap">
              <Link to={`/anime/${encodeURIComponent(featured.id)}`} className="btn-primary flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Assistir agora
              </Link>
              <button onClick={handleRandom} className={`btn-ghost flex items-center gap-2 ${randFlash?"scale-95 opacity-60":""} transition-all`}>
                🎲 Anime aleatório
              </button>
            </motion.div>
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Main tabs */}
        <div className="flex gap-2 mb-6 glass rounded-2xl p-1.5 w-fit">
          {([["catalogo","🎬 Catálogo"],["minha-lista",`❤️ Minha Lista${Object.keys(wlList).length>0?" ("+Object.keys(wlList).length+")":""}`]] as const).map(([t,l])=>(
            <button key={t} onClick={()=>setMainTab(t as typeof mainTab)}
              className={`py-2 px-5 rounded-xl text-sm font-bold transition-all ${mainTab===t?"bg-brand-500 text-white shadow-lg shadow-brand-500/30":"text-gray-400 hover:text-white"}`}>{l}</button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Catálogo */}
          {mainTab==="catalogo" && (
            <motion.div key="cat" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1"><SearchBar animes={animes} placeholder="Buscar por título, gênero, tag…" /></div>
                <div className="flex gap-2 flex-shrink-0">
                <div style={{ minWidth: 180 }}>
                  <CustomDropdown
                     label=""
                     options={sortOptions}
                     value={sortBy}
                     onChange={(v) => setSortBy(v)}
                     size="md"
                   />
                </div>
                  <button onClick={()=>setShowFilters(v=>!v)}
                    className={`btn-ghost text-sm py-2 px-3 flex items-center gap-1.5 flex-shrink-0 ${showFilters?"border-brand-500 text-brand-400":""}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
                    </svg>
                    Filtros
                    {activeFilters>0 && <span className="w-5 h-5 bg-brand-500 rounded-full text-white text-xs font-bold flex items-center justify-center">{activeFilters}</span>}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showFilters && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden mb-5">
                    <div className="glass rounded-2xl p-5 space-y-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0">Áudio</span>
                        {[["","Todos"],["legendado","💬 Legendado"],["dublado","🎙️ Dublado"],["dual-audio","🎧 Dual"]].map(([v,l])=>(
                          <button key={v} onClick={()=>setAudioF(v)} className={`btn-ghost text-xs py-1 px-3 ${audioF===v?"border-brand-500 text-brand-400 bg-brand-500/10":""}`}>{l}</button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0">Status</span>
                        {[["","Todos"],["em-andamento","🟢 Lançando"],["completo","🔵 Completo"],["pausado","🟡 Pausado"]].map(([v,l])=>(
                          <button key={v} onClick={()=>setStatusF(v)} className={`btn-ghost text-xs py-1 px-3 ${statusF===v?"border-brand-500 text-brand-400 bg-brand-500/10":""}`}>{l}</button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0">Nota mín.</span>
                        {[0,7,7.5,8,8.5,9].map(v=>(
                          <button key={v} onClick={()=>setMinRating(v)} className={`btn-ghost text-xs py-1 px-3 ${minRating===v?"border-brand-500 text-brand-400 bg-brand-500/10":""}`}>
                            {v===0?"Todos":`≥ ${v}★`}
                          </button>
                        ))}
                      </div>
                      {allGenres.length>0 && (
                        <div className="flex flex-wrap gap-1.5 items-start">
                          <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0 mt-1">Gênero</span>
                          <div className="flex flex-wrap gap-1.5">
                            {allGenres.map(g=>(
                              <button key={g} onClick={()=>setSelGenres(p=>p.includes(g)?p.filter(x=>x!==g):[...p,g])}
                                className={`text-xs py-0.5 px-2.5 rounded-full border transition-all capitalize ${selGenres.includes(g)?"bg-brand-500/20 border-brand-500 text-brand-300":"border-white/10 text-gray-500 hover:border-white/30"}`}>{g}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={()=>{setAudioF("");setStatusF("");setSelGenres([]);setMinRating(0);}}
                        className="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1">
                        ✕ Limpar filtros
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-2xl text-white tracking-wide">
                  Todos os Animes <span className="text-base text-gray-500 font-body font-normal">({catalogAnimes.length})</span>
                </h2>
                <button onClick={handleRandom} className="btn-ghost text-sm py-1.7 px-. flex items-center gap-2 group">
                  <span className="group-hover:rotate-45 inline-block transition-transform duration-500">🎲</span>
                  Aleatório
                </button>
              </div>

              {error && <div className="glass rounded-xl p-6 text-center border border-red-500/20 mb-6"><p className="text-red-400 font-semibold">{error}</p></div>}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {loading ? Array.from({length:12}).map((_,i)=><SkeletonCard key={i}/>) : catalogAnimes.map((a,i)=><AnimeCard key={a.id} anime={a} index={i} watchedCount={getWatchedCount(a.id)}/>)}
              </div>
              {!loading && catalogAnimes.length===0 && (
                <div className="text-center py-20">
                  <p className="text-5xl mb-4">🔍</p>
                  <p className="text-gray-400 font-semibold">Nenhum anime encontrado.</p>
                  <button onClick={()=>{setAudioF("");setStatusF("");setSelGenres([]);setMinRating(0);}} className="btn-ghost mt-4 text-sm">Limpar filtros</button>
                </div>
              )}
            </motion.div>
          )}

          {/* Minha Lista */}
          {mainTab==="minha-lista" && (
            <motion.div key="wl" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
              {Object.keys(wlList).length===0 ? (
                <div className="text-center py-20">
                  <p className="text-5xl mb-4 animate-float">❤️</p>
                  <p className="text-xl text-white font-bold mb-2">Sua lista está vazia</p>
                  <p className="text-gray-500 mb-6">Adicione animes usando o botão "Minha Lista" na página do anime</p>
                  <button onClick={()=>setMainTab("catalogo")} className="btn-primary">Ver catálogo →</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-6">
                    {WL_STATUSES.map(s=>{
                      const count = getByStatus(s).length;
                      return (
                        <button key={s} onClick={()=>setWlTab(s)}
                          className={`status-chip border ${wlTab===s?WATCHLIST_COLORS[s]:"border-white/10 text-gray-400 hover:text-white"}`}>
                          {WATCHLIST_LABELS[s]} {count>0 && <span className="ml-1 opacity-70">({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                  {wlAnimes.length>0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {wlAnimes.map((a,i)=><AnimeCard key={a.id} anime={a} index={i} watchedCount={getWatchedCount(a.id)}/>)}
                    </div>
                  ) : (
                    <div className="text-center py-16 text-gray-500">
                      <p className="text-4xl mb-3">{WATCHLIST_LABELS[wlTab].split(" ")[0]}</p>
                      <p>Nenhum anime em "{WATCHLIST_LABELS[wlTab].split(" ").slice(1).join(" ")}" ainda.</p>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
