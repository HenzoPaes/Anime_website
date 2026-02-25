// src/components/NotificationBell.tsx
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EpisodeNotification } from "../hooks/useNotifications";

interface Props {
  notifications: EpisodeNotification[];
  totalNew: number;
  onDismiss: (animeId: string) => void;
  onDismissAll: () => void;
}

export default function NotificationBell({ notifications, totalNew, onDismiss, onDismissAll }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        title="Notificações"
      >
        <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {totalNew > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-500 rounded-full text-white text-[10px] font-black flex items-center justify-center animate-pulse">
            {totalNew > 9 ? "9+" : totalNew}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 glass rounded-2xl shadow-2xl shadow-black/60 border border-white/10 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <h3 className="font-bold text-white text-sm">Notificações</h3>
            {notifications.length > 0 && (
              <button onClick={onDismissAll} className="text-xs text-brand-400 hover:text-brand-300">
                Limpar tudo
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-3xl mb-2">🔔</p>
                <p className="text-gray-500 text-sm">Sem novas notificações</p>
                <p className="text-gray-600 text-xs mt-1">Assine animes para ser notificado</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.animeId}
                  className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => { navigate(`/anime/${n.animeId}`); onDismiss(n.animeId); setOpen(false); }}
                >
                  <img src={n.animeCover} alt={n.animeTitle} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{n.animeTitle}</p>
                    <p className="text-xs text-brand-400 mt-0.5">
                      🆕 +{n.newEpisodes} ep{n.newEpisodes > 1 ? "s" : ""} novo{n.newEpisodes > 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">Total: {n.totalEpisodes} eps</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onDismiss(n.animeId); }}
                    className="p-1 text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
