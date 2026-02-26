import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useEpisodeHistory } from "../hooks/useepisodehistory";

// Configurações de Animação do seu estilo
const CONTAINER_VARIANTS = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1, 
    transition: { staggerChildren: 0.08, delayChildren: 0.1 } 
  },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

const ITEM_VARIANTS = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 25 } 
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora mesmo";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export default function HistoryPage() {
  const { history, removeFromHistory, clearHistory } = useEpisodeHistory();
  const navigate = useNavigate();

  return (
    <motion.div 
      variants={CONTAINER_VARIANTS} 
      initial="initial" 
      animate="animate" 
      exit="exit"
      className="relative min-h-screen pb-20"
    >
      {/* ── BACKGROUND ANIMADO (O segredo do seu estilo) ── */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        {/* Blob 1 */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1], 
            x: [0, 50, 0], 
            y: [0, 30, 0] 
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-brand-500/10 blur-[120px] rounded-full" 
        />
        {/* Blob 2 */}
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1], 
            x: [0, -40, 0], 
            y: [0, 60, 0] 
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" 
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        
        {/* Header com Estilo Glass */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-10">
          <div className="text-center sm:text-left">
            <h1 className="font-display text-4xl md:text-5xl text-white tracking-wide">
              Meu <span className="text-brand-400">Histórico</span>
            </h1>
            <p className="text-gray-500 text-sm mt-2 flex items-center gap-2 justify-center sm:justify-start">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              {history.length} episódios registrados
            </p>
          </div>

          {history.length > 0 && (
            <button 
              onClick={() => { if (confirm("Limpar todo o histórico?")) clearHistory(); }}
              className="btn-ghost group text-sm text-red-400 border-red-500/20 hover:bg-red-500/10 px-6 py-2.5 flex items-center gap-2"
            >
              <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Limpar Tudo
            </button>
          )}
        </header>

        {history.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 40 }} 
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-24 glass rounded-[2.5rem] border border-white/5"
          >
            <div className="text-6xl mb-6">🕒</div>
            <h2 className="text-2xl text-white font-bold mb-3">Sua linha do tempo está vazia</h2>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto leading-relaxed">
              Você ainda não assistiu nenhum episódio. Que tal começar agora?
            </p>
            <Link to="/" className="btn-primary px-10 py-3 shadow-lg shadow-brand-500/20">
              Explorar Catálogo
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {history.map((entry) => (
                <motion.div
                  key={`${entry.epId}-${entry.watchedAt}`}
                  variants={ITEM_VARIANTS}
                  layout
                  className="glass group relative rounded-2xl border border-white/5 hover:border-brand-500/30 transition-all duration-300 overflow-hidden flex items-center p-3 gap-4"
                >
                  {/* Thumbnail / Capa */}
                  <div className="relative w-20 h-28 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl">
                    <img 
                      src={entry.animeCover} 
                      alt="" 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                       <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center text-white scale-75 group-hover:scale-100 transition-transform">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                       </div>
                    </div>
                  </div>

                  {/* Detalhes */}
                  <div className="flex-1 min-w-0 pr-8">
                    <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1 truncate">
                      {entry.animeTitle}
                    </p>
                    <h3 className="font-bold text-white text-base md:text-lg leading-tight mb-2 truncate">
                      Ep. {entry.epNumber} — {entry.epTitle}
                    </h3>
                    
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${entry.audio === 'dub' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                        {entry.audio === 'dub' ? 'DUB' : 'LEG'}
                      </span>
                      <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {timeAgo(entry.watchedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Botão de Deletar Registro */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFromHistory(entry.animeId, entry.epId); }}
                    className="absolute top-2 right-2 p-2 text-gray-600 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                    title="Remover"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Click Area para Navegar */}
                  <div 
                    className="absolute inset-0 z-[1] cursor-pointer" 
                    onClick={() => navigate(`/anime/${encodeURIComponent(entry.animeId)}/ep/${entry.epId}?audio=${entry.audio}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}