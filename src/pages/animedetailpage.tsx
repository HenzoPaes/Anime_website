// src/pages/AnimeDetailPage.tsx
import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, Plus, Bell, Star, Calendar, 
  ChevronRight, Info, Share2, Clapperboard,
  Gamepad2, Bookmark, CheckCircle2, Search, X
} from "lucide-react";

import { useAnimeById, useRelated } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import { useNotifications } from "../hooks/usenotifications";
import { useAnimes } from "../hooks/useanimes";
import AnimeCard from "../components/animecard";
import WatchlistButton from "../components/watchlistbutton";

export function AnimeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const anime = useAnimeById(id || "");
  const { animes } = useAnimes();
  const { isWatched } = useWatched();
  
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedAudio, setSelectedAudio] = useState<"sub" | "dub">("sub");
  const [activeTab, setActiveTab] = useState("episódios");
  const [showTrailer, setShowTrailer] = useState(false);

  const { isSubscribed, toggleSubscription } = useNotifications(
    animes.map(a => ({ id: a.id, title: a.title, cover: a.cover, episodeCount: a.episodeCount }))
  );

  useEffect(() => {
    if (anime) {
      setSelectedSeason(anime.seasons[anime.seasons.length - 1]?.season || 1);
      window.scrollTo(0, 0);
    }
  }, [anime]);

  const currentSeason = useMemo(() => anime?.seasons.find(s => s.season === selectedSeason), [anime, selectedSeason]);
  const relatedAnimes = useRelated(anime);
  const episodes = useMemo(() => anime?.episodes?.filter((e: any) => String(e.season) === String(selectedSeason)) || [], [anime, selectedSeason]);

  if (!anime || !currentSeason) return <div className="h-screen bg-black" />;

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-brand-500 selection:text-white">
      
      {/* 1. BACKGROUND DINÂMICO (KEN BURNS EFFECT) */}
      <div className="fixed inset-0 h-[100vh] z-0">
        <motion.img 
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.4 }}
          transition={{ duration: 2, ease: "easeOut" }}
          src={anime.bannerImage || anime.coverImage} 
          className="w-full h-full object-cover filter blur-[2px] brightness-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-[#050505]/20" />
      </div>

      <div className="relative z-10">
        
        {/* 2. CONTEÚDO PRINCIPAL (LAYOUT ASIMÉTRICO) */}
        <main className="max-w-[1800px] mx-auto px-6 pt-32 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* LADO ESQUERDO: INFO PRINCIPAL */}
            <div className="lg:col-span-8 space-y-8">
              <motion.div 
                initial={{ x: -50, opacity: 0 }} 
                animate={{ x: 0, opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3">
                  <span className="bg-brand-500 text-black text-[10px] font-black px-2 py-1 rounded-sm tracking-tighter uppercase">
                    {currentSeason.year}
                  </span>
                  <div className="flex text-yellow-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < Math.floor(currentSeason.score / 2) ? 'fill-current' : 'opacity-30'}`} />
                    ))}
                  </div>
                </div>

                <h1 className="text-6xl md:text-9xl font-black uppercase tracking-tighter leading-[0.8] italic">
                  {anime.title.split(' ').map((word, i) => (
                    <span key={i} className={i % 2 === 0 ? "block" : "block text-transparent stroke-text"}>
                      {word}
                    </span>
                  ))}
                </h1>

                <div className="flex flex-wrap gap-2 pt-4">
                  {anime.genre.map(g => (
                    <span key={g} className="px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-[11px] font-bold uppercase tracking-widest text-gray-300">
                      {g}
                    </span>
                  ))}
                </div>
              </motion.div>

              <motion.div 
                initial={{ y: 20, opacity: 0 }} 
                animate={{ y: 0, opacity: 1 }} 
                transition={{ delay: 0.3 }}
                className="flex items-center gap-6 pt-6"
              >
                <button 
                  onClick={() => navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${episodes[0]?.id}`)}
                  className="group relative px-10 py-5 bg-white text-black font-black uppercase tracking-widest text-sm overflow-hidden transition-all hover:scale-105"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Play className="w-5 h-5 fill-current" /> Assistir Agora
                  </span>
                  <div className="absolute inset-0 bg-brand-500 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>

                <button 
                  onClick={() => setShowTrailer(true)}
                  className="flex items-center gap-2 font-black uppercase tracking-widest text-xs border-b-2 border-brand-500 pb-1 hover:text-brand-400 transition-colors"
                >
                  <Clapperboard className="w-4 h-4" /> Ver Trailer
                </button>
              </motion.div>

              {/* TABS DE CONTEÚDO */}
              <div className="pt-20">
                <div className="flex gap-12 border-b border-white/5 mb-10">
                  {['episódios', 'detalhes', 'relacionados'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-4 text-xs font-black uppercase tracking-[0.2em] relative transition-colors
                      ${activeTab === tab ? "text-brand-400" : "text-gray-600 hover:text-white"}`}
                    >
                      {tab}
                      {activeTab === tab && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-brand-400" />
                      )}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {activeTab === 'episódios' && (
                    <motion.div 
                      key="eps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                      {episodes.map((ep: any) => (
                        <EpisodeCard key={ep.id} ep={ep} anime={anime} audio={selectedAudio} isWatched={isWatched(anime.id, ep.id)} />
                      ))}
                    </motion.div>
                  )}
                  {activeTab === 'relacionados' && (
                    <motion.div 
                      key="rel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="grid grid-cols-2 md:grid-cols-4 gap-6"
                    >
                      {relatedAnimes.map(a => <AnimeCard key={a.id} anime={a} />)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* LADO DIREITO: BENTO BOX INFO */}
            <div className="lg:col-span-4 space-y-6">
              <motion.div 
                initial={{ x: 50, opacity: 0 }} 
                animate={{ x: 0, opacity: 1 }}
                className="bg-white/[0.03] backdrop-blur-3xl border border-white/5 p-8 rounded-[2rem] sticky top-32"
              >
                <div className="space-y-8">
                  <div className="flex justify-between items-start">
                    <img src={anime.cover} className="w-32 rounded-2xl shadow-2xl" alt="" />
                    <div className="flex flex-col gap-2">
                      <WatchlistButton animeId={anime.id} />
                      <button 
                        onClick={() => toggleSubscription(anime.id)}
                        className={`p-3 rounded-xl border transition-all ${isSubscribed(anime.id) ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'bg-white/5 border-white/10 text-gray-400'}`}
                      >
                        <Bell className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-brand-500">Sinopse</h3>
                    <p className="text-sm text-gray-400 leading-relaxed font-medium">
                      {currentSeason.synopsis}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                    <InfoStat label="Estúdio" value={anime.studio} />
                    <InfoStat label="Status" value={currentSeason.status === 'ongoing' ? 'Lançando' : 'Completo'} />
                    <InfoStat label="Áudio" value="LEG / DUB" />
                    <InfoStat label="Eps" value={`${currentSeason.currentEpisode} / ${currentSeason.episodes}`} />
                  </div>

                  <div className="pt-4">
                     <div className="flex justify-between text-[10px] font-black uppercase mb-2 text-gray-500">
                        <span>Progresso da obra</span>
                        <span>{Math.round((currentSeason.currentEpisode / currentSeason.episodes) * 100)}%</span>
                     </div>
                     <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }} 
                          animate={{ width: `${(currentSeason.currentEpisode / currentSeason.episodes) * 100}%` }}
                          className="h-full bg-gradient-to-r from-brand-600 to-brand-400 shadow-[0_0_20px_rgba(124,58,237,0.4)]" 
                        />
                     </div>
                  </div>
                </div>
              </motion.div>
            </div>

          </div>
        </main>
      </div>

      {/* MODAL TRAILER (OVERLAY) */}
      <AnimatePresence>
        {showTrailer && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => setShowTrailer(false)}
          >
            <div className="relative w-full max-w-6xl aspect-video rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] border border-white/10">
              <button className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full z-10 transition-colors">
                <X className="w-6 h-6" />
              </button>
              <iframe 
                src={`https://www.youtube.com/embed/${getYoutubeId(currentSeason.trailer || "")}?autoplay=1`}
                className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .stroke-text {
          -webkit-text-stroke: 1px rgba(255,255,255,0.2);
        }
        @media (min-width: 1024px) {
          .stroke-text:hover {
            -webkit-text-stroke: 1px #7c3aed;
            transition: all 0.3s;
          }
        }
      `}</style>
    </div>
  );
}

// COMPONENTES AUXILIARES INTERNOS
function InfoStat({ label, value }: { label: string, value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-black uppercase text-gray-600 tracking-widest">{label}</div>
      <div className="text-xs font-bold text-white uppercase">{value}</div>
    </div>
  );
}

function EpisodeCard({ ep, anime, audio, isWatched }: any) {
  const navigate = useNavigate();
  return (
    <button 
      onClick={() => navigate(`/anime/${encodeURIComponent(anime.id)}/ep/${ep.id}?audio=${audio}`)}
      className="group flex items-center gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/10 transition-all text-left"
    >
      <div className="relative w-24 h-16 rounded-xl overflow-hidden bg-dark-800 flex-shrink-0">
        <img src={anime.cover} className="w-full h-full object-cover opacity-20 group-hover:scale-110 transition-transform" alt="" />
        <div className="absolute inset-0 flex items-center justify-center font-black italic text-xl">
           {String(ep.number).padStart(2, '0')}
        </div>
        {isWatched && <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-black uppercase tracking-tighter text-sm truncate group-hover:text-brand-400 transition-colors">
          {ep.title}
        </h4>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">24 MIN</span>
          <div className="w-1 h-1 bg-gray-700 rounded-full" />
          <span className="text-[10px] text-brand-500 font-black uppercase italic">Play Now</span>
        </div>
      </div>
    </button>
  );
}

function getYoutubeId(url: string) {
  const m = url?.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : "";
}

export default AnimeDetailPage;