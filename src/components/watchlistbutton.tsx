import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWatchlist, WatchStatus, WATCHLIST_LABELS, WATCHLIST_COLORS } from "../hooks/usewatchlist";

const STATUSES: WatchStatus[] = ["assistindo", "quero-ver", "concluido", "droppado", "reassistindo"];

interface Props { animeId: string; compact?: boolean; }

export default function WatchlistButton({ animeId, compact = false }: Props) {
  const { getStatus, setStatus } = useWatchlist();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getStatus(animeId);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 font-bold rounded-xl transition-all duration-200 border ${
          current
            ? `${WATCHLIST_COLORS[current]} py-2 px-4 text-sm`
            : compact
              ? "btn-ghost py-1.5 px-3 text-xs"
              : "btn-ghost py-2 px-4 text-sm"
        }`}
        title={current ? WATCHLIST_LABELS[current] : "Adicionar à lista"}
      >
        {current ? (
          <>
            <span>{WATCHLIST_LABELS[current]}</span>
            <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {!compact && <span>Minha Lista</span>}
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 left-0 z-50 glass rounded-xl shadow-2xl shadow-black/50 overflow-hidden min-w-[180px] border border-white/10"
          >
            {STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => { setStatus(animeId, current === status ? null : status); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors text-left
                  ${current === status ? "bg-white/10 text-white" : "text-gray-300 hover:bg-white/5"}`}
              >
                <span className="text-base leading-none">{WATCHLIST_LABELS[status].split(" ")[0]}</span>
                <span>{WATCHLIST_LABELS[status].split(" ").slice(1).join(" ")}</span>
                {current === status && (
                  <svg className="w-4 h-4 ml-auto text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                )}
              </button>
            ))}
            {current && (
              <button
                onClick={() => { setStatus(animeId, null); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Remover da lista
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
