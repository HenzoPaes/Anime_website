// src/components/NotificationBell.tsx
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { EpisodeNotification } from "../hooks/usenotifications";

interface Props {
  notifications: EpisodeNotification[];
  totalNew: number;
  onDismiss: (animeId: string) => void;
  onDismissAll: () => void;
}

// ==========================================
// CONFIGURAÇÕES DE ANIMAÇÃO
// ==========================================
const DROPDOWN_ANIM = {
  hidden: { opacity: 0, y: -10, scale: 0.95, transformOrigin: "top right" },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
};

const ITEM_ANIM = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
};

export default function NotificationBell({ notifications, totalNew, onDismiss, onDismissAll }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  },[]);

  return (
    <div ref={ref} className="relative z-50">
      
      {/* ========================================== */}
      {/* BOTÃO DO SINO */}
      {/* ========================================== */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative p-2.5 rounded-xl transition-all duration-300 ${
          open ? "bg-black/10 shadow-inner" : "bg-transparent hover:bg-white/5"
        }`}
        title="Notificações"
      >
        <motion.svg 
          animate={totalNew > 0 ? { rotate:[0, -15, 15, -15, 15, 0] } : {}}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.5 }}
          className={`w-5 h-5 ${totalNew > 0 ? "text-white" : "text-gray-400"}`} 
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </motion.svg>
        
        {/* Badge de quantidade */}
        <AnimatePresence>
          {totalNew > 0 && (
            <motion.span 
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-brand-500 rounded-full text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-brand-500/40 border-2 border-dark-900"
            >
              {totalNew > 9 ? "9+" : totalNew}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ========================================== */}
      {/* DROPDOWN DE NOTIFICAÇÕES */}
      {/* ========================================== */}
      <AnimatePresence>
        {open && (
          <motion.div 
            variants={DROPDOWN_ANIM}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-3 w-80 sm:w-96 glass rounded-2xl shadow-2xl shadow-black/80 border border-white/10 overflow-hidden backdrop-blur-xl bg-dark-900/80"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
              <h3 className="font-display font-bold text-white tracking-wide flex items-center gap-2">
                Notificações
                {totalNew > 0 && <span className="bg-brand-500/20 text-brand-400 text-xs py-0.5 px-2 rounded-full font-body">{totalNew} novas</span>}
              </h3>
              {notifications.length > 0 && (
                <button 
                  onClick={onDismissAll} 
                  className="text-xs font-semibold text-gray-400 hover:text-brand-400 transition-colors"
                >
                  Limpar tudo
                </button>
              )}
            </div>

            {/* Lista com scroll estilizado nativamente com Tailwind */}
            <div className="max-h-[22rem] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              
              {/* Estado Vazio */}
              {notifications.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                  className="py-12 text-center flex flex-col items-center justify-center"
                >
                  <motion.p 
                    animate={{ y: [0, -10, 0] }} 
                    transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    className="text-5xl mb-3 opacity-60"
                  >
                    🔕
                  </motion.p>
                  <p className="text-gray-300 font-bold mb-1">Tudo limpo por aqui</p>
                  <p className="text-gray-500 text-xs max-w-[200px] leading-relaxed">Assine seus animes favoritos para ser avisado sobre novos episódios.</p>
                </motion.div>
              ) : (
                /* Lista de Itens */
                <div className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {notifications.map((n, i) => (
                      <motion.div
                        key={n.animeId}
                        layout // Faz com que os itens subam suavemente quando um é deletado
                        variants={ITEM_ANIM}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ delay: i * 0.05 }} // Efeito em cascata ao abrir
                        className="group flex items-center gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer relative overflow-hidden"
                        onClick={() => { 
                          navigate(`/anime/${n.animeId}`); 
                          onDismiss(n.animeId); 
                          setOpen(false); 
                        }}
                      >
                        {/* Indicador visual de nova notificação */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500 rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity" />

                        <img src={n.animeCover} alt={n.animeTitle} className="w-12 h-16 object-cover rounded-lg flex-shrink-0 shadow-md" />
                        
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="text-sm font-bold text-gray-100 truncate group-hover:text-white transition-colors">
                            {n.animeTitle}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs font-semibold text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded text-center">
                              +{n.newEpisodes} ep{n.newEpisodes > 1 ? "s" : ""}
                            </span>
                            <span className="text-[11px] text-gray-500 font-medium">
                              (Total: {n.totalEpisodes})
                            </span>
                          </div>
                        </div>
                        
                        <button
                          onClick={e => { 
                            e.stopPropagation(); // Evita que o clique feche o dropdown inteiro/navegue
                            onDismiss(n.animeId); 
                          }}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all flex-shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-100"
                          title="Remover notificação"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}