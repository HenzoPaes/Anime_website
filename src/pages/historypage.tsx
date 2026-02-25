// src/pages/HistoryPage.tsx
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useEpisodeHistory } from "../hooks/useepisodehistory";

const PAGE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

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
    <motion.div variants={PAGE} initial="initial" animate="animate" exit="exit"
      className="max-w-4xl mx-auto px-4 py-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">Histórico</h1>
          <p className="text-gray-500 text-sm mt-1">{history.length} episódios assistidos</p>
        </div>
        {history.length > 0 && (
          <button onClick={() => { if (confirm("Limpar todo o histórico?")) clearHistory(); }}
            className="btn-ghost text-sm text-red-400 border-red-500/20 hover:bg-red-500/10">
            🗑 Limpar tudo
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">📺</p>
          <p className="text-xl text-white font-bold mb-2">Sem histórico</p>
          <p className="text-gray-500 mb-6">Seus episódios assistidos aparecerão aqui</p>
          <Link to="/" className="btn-primary">Ver catálogo</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((entry, i) => (
            <motion.div key={`${entry.epId}-${i}`}
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass rounded-xl flex items-center gap-4 p-4 group hover:border-white/10 border border-transparent transition-all cursor-pointer"
              onClick={() => navigate(`/anime/${encodeURIComponent(entry.animeId)}/ep/${entry.epId}?audio=${entry.audio}`)}>

              <img src={entry.animeCover} alt={entry.animeTitle}
                className="w-12 h-16 object-cover rounded-lg flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />

              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">{entry.animeTitle}</p>
                <p className="font-bold text-white text-sm truncate">
                  Ep. {entry.epNumber} — {entry.epTitle}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${entry.audio === "dub" ? "bg-purple-600/80 text-purple-100" : "bg-blue-600/80 text-blue-100"}`}>
                    {entry.audio === "dub" ? "DUB" : "LEG"}
                  </span>
                  <span className="text-xs text-gray-600">{timeAgo(entry.watchedAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => { e.stopPropagation(); removeFromHistory(entry.animeId, entry.epId); }}
                  className="p-2 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <svg className="w-5 h-5 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
