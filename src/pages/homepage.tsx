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

// ==========================================
// CONSTANTES E CONFIGURAÇÕES
// ==========================================
const PAGE = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0 }
};

const WL_STATUSES: WatchStatus[] =["assistindo", "quero-ver", "concluido", "droppado"];

const SORT_OPTIONS: DropdownOption<string>[] =[
  { value: "rating",   label: "Melhor avaliados" },
  { value: "newest",   label: "Mais recentes" },
  { value: "episodes", label: "Mais episódios" },
  { value: "title",    label: "Título A-Z" },
];

const AUDIO_OPTIONS =[
  { value: "",           label: "Todos" },
  { value: "legendado",  label: "💬 Legendado" },
  { value: "dublado",    label: "🎙️ Dublado" },
  { value: "dual-audio", label: "🎧 Dual" }
];

const STATUS_OPTIONS =[
  { value: "",             label: "Todos" },
  { value: "em-andamento", label: "🟢 Lançando" },
  { value: "completo",     label: "🔵 Completo" },
  { value: "pausado",      label: "🟡 Pausado" }
];

const RATING_OPTIONS =[0, 7, 7.5, 8, 8.5, 9];

type TabType = "catalogo" | "minha-lista";

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function HomePage() {
  const { animes, loading, error } = useAnimes();
  const { getWatchedCount } = useWatched();
  const { list: wlList, getByStatus } = useWatchlist();
  const navigate = useNavigate();

  // Estados
  const [mainTab, setMainTab] = useState<TabType>("catalogo");
  const [wlTab, setWlTab] = useState<WatchStatus>("assistindo");
  const [showFilters, setShowFilters] = useState(false);
  const[randFlash, setRandFlash] = useState(false);

  // Estados de Filtro
  const[sortBy, setSortBy] = useState("rating");
  const [audioF, setAudioF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [selGenres, setSelGenres] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);

  // Define o Título da Página
  useEffect(() => {
    document.title = "AnimeVerse — Seu portal de animes";
  },[]);

  // ==========================================
  // MEMOS & LÓGICAS (Otimizados)
  // ==========================================

  // Pega o anime de maior nota para o Hero
  const featured = useMemo(() => {
    if (!animes.length) return null;
    return [...animes].filter(a => a.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  }, [animes]);

  // Extrai todos os gêneros únicos
  const allGenres = useMemo(() => {
    const s = new Set<string>();
    animes.forEach(a => (a.genres ||[]).forEach(g => s.add(g)));
    return Array.from(s).sort();
  }, [animes]);

  // Contador de filtros ativos
  const activeFilters =[audioF, statusF, ...selGenres, minRating > 0 ? "r" : ""].filter(Boolean).length;

  // Função para limpar todos os filtros
  const clearFilters = useCallback(() => {
    setAudioF("");
    setStatusF("");
    setSelGenres([]);
    setMinRating(0);
  },[]);

  // Aplica Filtros e Ordenação no Catálogo de forma limpa
  const catalogAnimes = useMemo(() => {
    return animes
      .filter(a => {
        if (audioF && a.audioType !== audioF) return false;
        if (statusF && a.status !== statusF) return false;
        if (minRating > 0 && (a.rating ?? 0) < minRating) return false;
        if (selGenres.length > 0 && !selGenres.every(g => (a.genres ||[]).includes(g))) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
        if (sortBy === "newest") return (b.year ?? 0) - (a.year ?? 0);
        if (sortBy === "episodes") return b.episodeCount - a.episodeCount;
        return a.title.localeCompare(b.title); // Fallback "title"
      });
  }, [animes, audioF, statusF, selGenres, minRating, sortBy]);

  // Lista da Watchlist
  const wlAnimes = useMemo(() => {
    const ids = getByStatus(wlTab);
    return ids.map(id => animes.find(a => a.id === id)).filter(Boolean) as typeof animes;
  },[animes, wlTab, wlList, getByStatus]);

  // Anime Aleatório
  const handleRandom = useCallback(() => {
    if (!animes.length) return;
    const candidates = animes.filter(a => a.rating && a.rating >= 7);
    const pick = candidates[Math.floor(Math.random() * candidates.length)] || animes[Math.floor(Math.random() * animes.length)];
    
    setRandFlash(true);
    setTimeout(() => { 
      setRandFlash(false); 
      navigate(`/anime/${encodeURIComponent(pick.id)}`); 
    }, 500);
  },[animes, navigate]);

  return (
    <motion.div variants={PAGE} initial="initial" animate="animate" exit="exit" className="pb-12">
      {/* ========================================== */}
      {/* HERO SECTION */}
      {/* ========================================== */}
      {featured && !loading && (
        <section className="relative overflow-hidden min-h-[420px] flex items-end">
          <div className="absolute inset-0">
            <img src={featured.banner || featured.cover} alt="" className="w-full h-full object-cover scale-110 blur-sm opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-dark-900 via-dark-900/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-transparent to-transparent" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-16 w-full">
            <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.2}} className="flex items-center gap-2 mb-3">
              <span className="badge bg-brand-500/20 text-brand-400 border border-brand-500/30">⭐ Melhor avaliado</span>
              <AudioBadge type={featured.audioType} />
            </motion.div>
            
            <motion.h1 initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
              className="font-display text-5xl md:text-7xl text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-3 leading-tight tracking-wide max-w-2xl drop-shadow-lg">
              {featured.title}
            </motion.h1>
            
            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.4}} className="flex flex-wrap items-center gap-3 mb-4 text-sm text-gray-400 font-medium">
              <span className="text-yellow-400 font-bold flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                {featured.rating?.toFixed(1)}
              </span>
              {featured.year && <><span>{featured.year}</span><span>•</span></>}
              <span>{featured.episodeCount} episódios</span>
              {featured.genres?.slice(0,3).map(g => <span key={g} className="capitalize bg-white/10 px-2 py-0.5 rounded-full text-xs">{g}</span>)}
            </motion.div>
            
            {featured.synopsis && (
              <motion.p initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.45}} className="text-gray-300 text-sm md:text-base line-clamp-2 mb-8 max-w-xl leading-relaxed">
                {featured.synopsis}
              </motion.p>
            )}
            
            <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.5}} className="flex gap-3 flex-wrap">
              <Link to={`/anime/${encodeURIComponent(featured.id)}`} className="btn-primary flex items-center gap-2 px-6 py-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Assistir agora
              </Link>
              <button onClick={handleRandom} className={`btn-ghost flex items-center gap-2 px-6 py-3 ${randFlash ? "scale-95 opacity-60" : ""} transition-all duration-300 hover:bg-white/10`}>
                🎲 Anime aleatório
              </button>
            </motion.div>
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ========================================== */}
        {/* NAVEGAÇÃO PRINCIPAL (TABS) */}
        {/* ========================================== */}
        <div className="flex gap-2 mb-8 glass rounded-2xl p-1.5 w-fit">
          <button 
            onClick={() => setMainTab("catalogo")}
            className={`py-2 px-6 rounded-xl text-sm font-bold transition-all duration-300 ${mainTab === "catalogo" ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30" : "text-gray-400 hover:text-white"}`}>
            🎬 Catálogo
          </button>
          <button 
            onClick={() => setMainTab("minha-lista")}
            className={`py-2 px-6 rounded-xl text-sm font-bold transition-all duration-300 ${mainTab === "minha-lista" ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30" : "text-gray-400 hover:text-white"}`}>
            ❤️ Minha Lista {Object.keys(wlList).length > 0 && `(${Object.keys(wlList).length})`}
          </button>
        </div>

        <AnimatePresence mode="wait">
          
          {/* ========================================== */}
          {/* TAB: CATÁLOGO */}
          {/* ========================================== */}
          {mainTab === "catalogo" && (
            <motion.div key="cat" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="space-y-6">
              
              {/* Controles do Catálogo */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <SearchBar animes={animes} placeholder="Buscar por título, gênero, tag…" />
                </div>
                
                <div className="flex gap-2 flex-shrink-0">
                  <div style={{ minWidth: 180 }}>
                    <CustomDropdown label="" options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} size="md" />
                  </div>
                  <button onClick={() => setShowFilters(!showFilters)}
                    className={`btn-ghost text-sm py-2 px-4 flex items-center gap-2 flex-shrink-0 transition-all ${showFilters ? "border-brand-500 text-brand-400 bg-brand-500/10" : "hover:bg-white/5"}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
                    </svg>
                    Filtros
                    {activeFilters > 0 && <span className="w-5 h-5 bg-brand-500 rounded-full text-white text-xs font-bold flex items-center justify-center">{activeFilters}</span>}
                  </button>
                </div>
              </div>

              {/* Painel de Filtros */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                    <div className="glass rounded-2xl p-6 space-y-5">
                      
                      {/* Áudio */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0">Áudio</span>
                        {AUDIO_OPTIONS.map(({value, label}) => (
                          <button key={value} onClick={() => setAudioF(value)} className={`btn-ghost text-xs py-1.5 px-3 transition-colors ${audioF === value ? "border-brand-500 text-brand-400 bg-brand-500/10" : "hover:border-white/20"}`}>{label}</button>
                        ))}
                      </div>

                      {/* Status */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0">Status</span>
                        {STATUS_OPTIONS.map(({value, label}) => (
                          <button key={value} onClick={() => setStatusF(value)} className={`btn-ghost text-xs py-1.5 px-3 transition-colors ${statusF === value ? "border-brand-500 text-brand-400 bg-brand-500/10" : "hover:border-white/20"}`}>{label}</button>
                        ))}
                      </div>

                      {/* Nota Mínima */}
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0">Nota mín.</span>
                        {RATING_OPTIONS.map(v => (
                          <button key={v} onClick={() => setMinRating(v)} className={`btn-ghost text-xs py-1.5 px-3 transition-colors ${minRating === v ? "border-brand-500 text-brand-400 bg-brand-500/10" : "hover:border-white/20"}`}>
                            {v === 0 ? "Todos" : `≥ ${v}★`}
                          </button>
                        ))}
                      </div>

                      {/* Gêneros */}
                      {allGenres.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-start">
                          <span className="text-xs font-bold text-gray-500 uppercase w-16 flex-shrink-0 mt-2">Gênero</span>
                          <div className="flex flex-wrap gap-2">
                            {allGenres.map(g => (
                              <button key={g} onClick={() => setSelGenres(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g])}
                                className={`text-xs py-1 px-3 rounded-full border transition-all capitalize ${selGenres.includes(g) ? "bg-brand-500/20 border-brand-500 text-brand-300" : "border-white/10 text-gray-400 hover:border-white/30 hover:text-white"}`}>{g}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Limpar Filtros */}
                      <div className="pt-2">
                        <button onClick={clearFilters} className="text-sm text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1.5 transition-colors w-fit p-1">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          Limpar todos os filtros
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Título da Seção */}
              <div className="flex items-center justify-between mt-2">
                <h2 className="font-display text-2xl text-white tracking-wide flex items-center gap-2">
                  Todos os Animes 
                  <span className="bg-white/10 text-gray-400 text-sm py-0.5 px-2.5 rounded-full font-body font-normal">{catalogAnimes.length}</span>
                </h2>
                <button onClick={handleRandom} className="btn-ghost text-sm py-2 px-4 flex items-center gap-2 group hover:bg-white/5">
                  <span className="group-hover:rotate-45 inline-block transition-transform duration-500">🎲</span>
                  Aleatório
                </button>
              </div>

              {/* Mensagem de Erro */}
              {error && (
                <div className="glass rounded-xl p-6 text-center border border-red-500/20">
                  <p className="text-red-400 font-semibold">{error}</p>
                </div>
              )}

              {/* Grid de Animes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {loading 
                  ? Array.from({length: 12}).map((_, i) => <SkeletonCard key={i}/>) 
                  : catalogAnimes.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} watchedCount={getWatchedCount(a.id)}/>)
                }
              </div>

              {/* Estado Vazio */}
              {!loading && catalogAnimes.length === 0 && (
                <div className="text-center py-24 glass rounded-3xl border border-white/5 mt-4">
                  <p className="text-6xl mb-4">🔍</p>
                  <p className="text-xl text-white font-bold mb-2">Nenhum anime encontrado</p>
                  <p className="text-gray-400 mb-6">Tente ajustar seus filtros para encontrar o que procura.</p>
                  <button onClick={clearFilters} className="btn-primary">Limpar todos os filtros</button>
                </div>
              )}
            </motion.div>
          )}

          {/* ========================================== */}
          {/* TAB: MINHA LISTA */}
          {/* ========================================== */}
          {mainTab === "minha-lista" && (
            <motion.div key="wl" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
              {Object.keys(wlList).length === 0 ? (
                <div className="text-center py-24 glass rounded-3xl border border-white/5">
                  <motion.p animate={{y:[0,-10,0]}} transition={{repeat:Infinity, duration:2}} className="text-6xl mb-4 drop-shadow-lg">❤️</motion.p>
                  <p className="text-2xl text-white font-bold mb-2 tracking-wide">Sua lista está vazia</p>
                  <p className="text-gray-400 mb-8 max-w-md mx-auto">Salve animes para assistir depois, marque os que já viu e organize seus favoritos!</p>
                  <button onClick={() => setMainTab("catalogo")} className="btn-primary px-8 py-3 text-lg shadow-brand-500/20">Ver catálogo de animes</button>
                </div>
              ) : (
                <>
                  {/* Status Chips */}
                  <div className="flex flex-wrap gap-2 mb-8">
                    {WL_STATUSES.map(s => {
                      const count = getByStatus(s).length;
                      return (
                        <button key={s} onClick={() => setWlTab(s)}
                          className={`status-chip border px-4 py-2 transition-all ${wlTab === s ? WATCHLIST_COLORS[s] : "border-white/10 text-gray-400 hover:text-white hover:bg-white/5"}`}>
                          {WATCHLIST_LABELS[s]} {count > 0 && <span className="ml-1.5 opacity-60 font-medium">({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Grid Watchlist */}
                  {wlAnimes.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {wlAnimes.map((a, i) => <AnimeCard key={a.id} anime={a} index={i} watchedCount={getWatchedCount(a.id)}/>)}
                    </div>
                  ) : (
                    <div className="text-center py-20 glass rounded-3xl border border-white/5">
                      <p className="text-5xl mb-4 opacity-50">📂</p>
                      <p className="text-xl text-white font-bold mb-2">Nenhum anime nesta categoria</p>
                      <p className="text-gray-500">Você ainda não tem animes marcados como "{WATCHLIST_LABELS[wlTab].split(" ").slice(1).join(" ")}".</p>
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