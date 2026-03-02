import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type WatchAction = "watchNow" | "continue" | "rewatch";

interface WatchButtonProps {
  animeId: string;
  totalEpisodes: number; // número total da temporada
  onWatchNow: () => void; // dispara ep 1
  onContinue: (episode: number) => void; // dispara último assistido
  onRewatch: () => void; // recomeçar
  compact?: boolean;
}

const LS_KEY = (animeId: string) => `anime_last_watched_${animeId}`;

export default function WatchButton({ animeId, totalEpisodes, onWatchNow, onContinue, onRewatch, compact }: WatchButtonProps) {
  const [saved, setSaved] = useState<{ episode: number; timestamp: number } | null>(null);
  const [pressed, setPressed] = useState(false);

  // load saved progress from localStorage whenever the animeId changes
  useEffect(() => {
    try {
      const json = localStorage.getItem(LS_KEY(animeId));
      if (json) setSaved(JSON.parse(json));
    } catch {
      // ignore malformed data
    }
  }, [animeId]);

  const computedState: WatchAction = useMemo(() => {
    if (saved && saved.episode > 1 && saved.episode <= totalEpisodes) {
      if (saved.episode >= totalEpisodes) return "rewatch";
      return "continue";
    }
    return "watchNow";
  }, [saved, totalEpisodes]);

  // label & aria
  const label = useMemo(() => {
    switch (computedState) {
      case "continue": return "Continuar Assistindo";
      case "rewatch": return "Reassista Agora!";
      default: return "Assista Agora!";
    }
  }, [computedState]);

  // click handler
  function handleClick() {
    setPressed(true);
    setTimeout(() => setPressed(false), 220);

    if (computedState === "continue") {
      const ep = saved?.episode ?? 1;
      onContinue(ep);
      return;
    }
    if (computedState === "rewatch") {
      onRewatch();
      return;
    }
    onWatchNow();
  }

  // small animated icon
  const Icon = () => (
    <motion.span
      initial={{ scale: 0.9, opacity: 0.9 }}
      animate={{ scale: pressed ? 0.92 : 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      aria-hidden
    >
      {computedState === "continue" ? "▶" : computedState === "rewatch" ? "⟲" : "▶"}
    </motion.span>
  );

  return (
    <AnimatePresence>
      <motion.button
        key={`watch-btn-${animeId}-${computedState}`}
        onClick={handleClick}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        aria-label={label}
        aria-pressed={pressed}
        style={{
          height: compact ? 36 : 44,
          padding: compact ? "0 14px" : "0 20px",
          borderRadius: 10,
          background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
          color: "#fff",
          fontSize: compact ? 13 : 14,
          fontWeight: 700,
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          gap: 10,
          alignItems: "center",
          boxShadow: "0 6px 20px rgba(109,40,217,0.18)",
          transform: pressed ? "translateY(1px) scale(0.996)" : undefined,
        }}
      >
        <Icon />
        <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      </motion.button>
    </AnimatePresence>
  );
}