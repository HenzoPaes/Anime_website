// src/components/WatchButton.tsx — versão DB
// Usa useWatchlist().getEntry(animeId).progress em vez de localStorage.
// Interface pública idêntica à versão anterior.

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWatchlist } from "../hooks/usewatchlist";

export type WatchAction = "watchNow" | "continue" | "rewatch";

interface WatchButtonProps {
  animeId:       string;
  totalEpisodes: number;
  onWatchNow:    () => void;
  onContinue:    (episode: number) => void;
  onRewatch:     () => void;
  compact?:      boolean;
}

export default function WatchButton({
  animeId,
  totalEpisodes,
  onWatchNow,
  onContinue,
  onRewatch,
  compact = false,
}: WatchButtonProps) {
  const { getEntry } = useWatchlist();
  const [pressed, setPressed] = useState(false);

  // Lê o progresso salvo do servidor (via useWatchlist)
  const entry    = getEntry(animeId);
  const progress = entry?.progress ?? 0; // último ep assistido (número)

  const computedState: WatchAction = useMemo(() => {
    if (progress > 0) {
      if (progress >= totalEpisodes) return "rewatch";
      return "continue";
    }
    return "watchNow";
  }, [progress, totalEpisodes]);

  const label = useMemo(() => {
    switch (computedState) {
      case "continue": return `Continuar — Ep ${progress + 1}`;
      case "rewatch":  return "Reassistir do início";
      default:         return "Assistir agora";
    }
  }, [computedState, progress]);

  function handleClick() {
    setPressed(true);
    setTimeout(() => setPressed(false), 220);

    switch (computedState) {
      case "continue": return onContinue(progress + 1);
      case "rewatch":  return onRewatch();
      default:         return onWatchNow();
    }
  }

  const icon = computedState === "rewatch" ? "⟲" : "▶";

  return (
    <AnimatePresence mode="wait">
      <motion.button
        key={`watch-btn-${animeId}-${computedState}`}
        onClick={handleClick}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        aria-label={label}
        style={{
          height:     compact ? 36 : 44,
          padding:    compact ? "0 14px" : "0 20px",
          borderRadius: 10,
          background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
          color:      "#fff",
          fontSize:   compact ? 13 : 14,
          fontWeight: 700,
          border:     "none",
          cursor:     "pointer",
          display:    "inline-flex",
          gap:        10,
          alignItems: "center",
          boxShadow:  "0 6px 20px rgba(109,40,217,0.2)",
          transform:  pressed ? "translateY(1px) scale(0.996)" : undefined,
          transition: "transform 0.12s",
        }}
      >
        <motion.span
          animate={{ scale: pressed ? 0.88 : 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          aria-hidden
        >
          {icon}
        </motion.span>
        <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      </motion.button>
    </AnimatePresence>
  );
}