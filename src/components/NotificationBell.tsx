import React, { useState, useRef, useEffect } from "react";
import { EpisodeNotification } from "./useEpisodeNotifications";

interface NotificationBellProps {
  notifications: EpisodeNotification[];
  totalNew: number;
  onMarkRead: (animeId: string) => void;
  onMarkAllRead: () => void;
  onNavigate?: (animeId: string) => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  totalNew,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "8px",
          color: "var(--text-primary, #fff)",
          borderRadius: "8px",
          transition: "background 0.2s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Notificações"
      >
        {/* Bell icon */}
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {totalNew > 0 && (
          <span style={{
            position: "absolute",
            top: "4px",
            right: "4px",
            background: "var(--accent, #e94560)",
            color: "#fff",
            borderRadius: "9999px",
            fontSize: "0.6rem",
            fontWeight: 700,
            minWidth: "16px",
            height: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            border: "2px solid var(--bg-primary, #0f0f1a)",
            animation: "bellPulse 2s ease infinite",
          }}>
            {totalNew > 99 ? "99+" : totalNew}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "320px",
          background: "var(--dropdown-menu-bg, rgba(16,16,28,0.98))",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          backdropFilter: "blur(20px)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          zIndex: 9999,
          overflow: "hidden",
          animation: "dropdownFadeIn 0.15s ease",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary, #fff)" }}>
              Notificações
              {totalNew > 0 && (
                <span style={{
                  marginLeft: "8px",
                  background: "var(--accent, #e94560)",
                  color: "#fff",
                  fontSize: "0.7rem",
                  padding: "2px 7px",
                  borderRadius: "9999px",
                  fontWeight: 700,
                }}>
                  {totalNew} novos
                </span>
              )}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={onMarkAllRead}
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--accent, #e94560)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  padding: "4px 8px",
                  borderRadius: "6px",
                }}
              >
                Marcar tudo como lido
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: "380px", overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--text-muted, #888)",
                fontSize: "0.9rem",
              }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔔</div>
                Sem novas notificações
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.animeId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    cursor: onNavigate ? "pointer" : "default",
                    transition: "background 0.15s",
                  }}
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate(notif.animeId);
                      onMarkRead(notif.animeId);
                      setIsOpen(false);
                    }
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {notif.thumbnail && (
                    <img
                      src={notif.thumbnail}
                      alt={notif.title}
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600,
                      fontSize: "0.88rem",
                      color: "var(--text-primary, #fff)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {notif.title}
                    </div>
                    <div style={{
                      fontSize: "0.78rem",
                      color: "var(--accent, #e94560)",
                      marginTop: "2px",
                    }}>
                      +{notif.newEpisodes} ep{notif.newEpisodes > 1 ? "s" : ""} novo{notif.newEpisodes > 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkRead(notif.animeId);
                    }}
                    type="button"
                    title="Marcar como lido"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "rgba(255,255,255,0.3)",
                      padding: "4px",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bellPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default NotificationBell;
