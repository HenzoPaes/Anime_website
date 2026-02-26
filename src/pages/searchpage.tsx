// src/pages/SearchPage.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, SlidersHorizontal, X, Frown, 
  Filter, Star, Mic, MessageSquare, MonitorPlay 
} from "lucide-react";
import Fuse from "fuse.js";

import { useAnimes } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import AnimeCard from "../components/animecard";
import SkeletonCard from "../components/skeletoncard";
import { Anime } from "../types";
import CustomDropdown from "../components/customdropdown";

const FUSE_OPTS = {
  keys: [
    { name: "title", weight: 0.5 },
    { name: "alt_titles", weight: 0.3 },
    { name: "tags", weight: 0.1 },
    { name: "genres", weight: 0.1 }
  ],
  threshold: 0.4,
  includeScore: true,
};

export default function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") || "";
  const [localQ, setLocalQ] = useState(q);
  const { animes, loading } = useAnimes();
  const { getWatchedCount } = useWatched();
  
  // Estados de Filtro
  const fuseRef = useRef<Fuse<Anime>>();
  const debRef = useRef<ReturnType<typeof setTimeout>>();
  const [audioF, setAudioF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [sortBy, setSortBy] = useState("relevance");
  const [minRating, setMinRating] = useState(0);
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => { fuseRef.current = new Fuse(animes, FUSE_OPTS); }, [animes]);
  useEffect(() => { setLocalQ(q); }, [q]);
  useEffect(() => { 
    document.title = q ? `"${q}" — Explorar` : "Explorar Animes"; 
  }, [q]);

  const results = useMemo(() => {
    let list: Anime[];
    if (q.trim() && fuseRef.current) {
      list = fuseRef.current.search(q).map(r => r.item);
    } else {
      list = [...animes];
    }

    if (audioF) list = list.filter(a => a.audioType === audioF);
    if (statusF) list = list.filter(a => a.status === statusF);
    if (minRating > 0) list = list.filter(a => (a.rating ?? 0) >= minRating);

    if (!q.trim() || sortBy !== "relevance") {
      if (sortBy === "newest") list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      else if (sortBy === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      else if (sortBy === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [q, animes, audioF, statusF, sortBy, minRating]);

  const handleQ = (v: string) => {
    setLocalQ(v);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setSp(v.trim() ? { q: v.trim() } : {}), 300);
  };

  const clearFilters = () => {
    setAudioF("");
    setStatusF("");
    setMinRating(0);
    setLocalQ("");
    setSp({});
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="max-w-7xl mx-auto px-4 py-8 md:py-12"
    >
      {/* Header & Search Bar */}
      <header className="mb-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-5xl font-display font-bold text-white tracking-tight">
              {q ? "Resultados da" : "Explorar"} <span className="text-brand-500">Busca</span>
            </h1>
            <p className="text-gray-500 mt-2">Encontre sua próxima história favorita entre {animes.length} títulos.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all font-bold text-sm
              ${showFilters ? "bg-brand-500 border-brand-500 text-white" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
            </button>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute inset-0 bg-brand-500/20 blur-2xl group-focus-within:bg-brand-500/30 transition-all rounded-full" />
          <div className="relative flex items-center">
            <Search className="absolute left-5 w-6 h-6 text-gray-500 group-focus-within:text-brand-400 transition-colors" />
            <input 
              type="search" 
              value={localQ} 
              onChange={e => handleQ(e.target.value)}
              placeholder="Digite o nome do anime, gênero ou estúdio..." 
              className="w-full bg-dark-900/80 border border-white/10 rounded-2xl py-5 pl-14 pr-6 text-xl text-white placeholder:text-gray-600 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all shadow-2xl"
            />
            {localQ && (
              <button 
                onClick={clearFilters}
                className="absolute right-5 p-2 bg-white/5 hover:bg-white/10 rounded-full text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Painel de Filtros */}
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* Grupo: Áudio */}
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-bold flex items-center gap-2">
                    <Mic className="w-3 h-3" /> Tipo de Áudio
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[["", "Todos"], ["legendado", "Legendado"], ["dublado", "Dublado"], ["dual-audio", "Dual Audio"]].map(([v, l]) => (
                      <button 
                        key={v} onClick={() => setAudioF(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border
                        ${audioF === v ? "bg-brand-500 border-brand-500 text-white" : "bg-dark-800 border-white/5 text-gray-500 hover:border-brand-500/50"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grupo: Status */}
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-bold flex items-center gap-2">
                    <MonitorPlay className="w-3 h-3" /> Status da Obra
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[["", "Todos"], ["em-andamento", "Em Lançamento"], ["completo", "Finalizado"]].map(([v, l]) => (
                      <button 
                        key={v} onClick={() => setStatusF(v)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border
                        ${statusF === v ? "bg-brand-500 border-brand-500 text-white" : "bg-dark-800 border-white/5 text-gray-500 hover:border-brand-500/50"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grupo: Avaliação */}
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-bold flex items-center gap-2">
                    <Star className="w-3 h-3" /> Mínimo de Estrelas
                  </label>
                  <div className="flex items-center gap-2">
                    {[0, 7, 8, 9].map(v => (
                      <button 
                        key={v} onClick={() => setMinRating(v)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border
                        ${minRating === v ? "bg-yellow-500 border-yellow-500 text-black" : "bg-dark-800 border-white/5 text-gray-500 hover:border-yellow-500/50"}`}
                      >
                        {v === 0 ? "Todas" : `${v}+`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar de Resultados */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-500/10 text-brand-400 px-3 py-1 rounded-full text-sm font-bold border border-brand-500/20">
            {results.length} resultados
          </span>
          {results.length < animes.length && (
            <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-white transition-colors underline underline-offset-4">
              Limpar filtros
            </button>
          )}
        </div>
        
        <div className="w-full sm:w-64">
          <CustomDropdown
            label="Ordenar por:"
            options={[
              { value: "relevance", label: "✨ Relevância" },
              { value: "newest", label: "📅 Mais recentes" },
              { value: "rating", label: "⭐ Melhor avaliados" },
              { value: "title", label: "🔤 Título A-Z" }
            ]}
            value={sortBy}
            onChange={v => setSortBy(v)}
          />
        </div>
      </div>

      {/* Grid de Conteúdo */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : results.length > 0 ? (
        <motion.div 
          layout
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6"
        >
          {results.map((a, i) => (
            <AnimeCard 
              key={a.id} 
              anime={a} 
              index={i} 
              watchedCount={getWatchedCount(a.id)} 
            />
          ))}
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
            <Frown className="w-12 h-12 text-gray-600" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Nenhum anime encontrado</h3>
          <p className="text-gray-500 max-w-xs mb-8">
            Tente ajustar seus filtros ou buscar por termos mais genéricos.
          </p>
          <button onClick={clearFilters} className="px-8 py-3 bg-brand-500 text-white rounded-2xl font-bold hover:scale-105 transition-all">
            Resetar Busca
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}