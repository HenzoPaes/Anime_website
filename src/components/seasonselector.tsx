import React from "react";
import CustomDropdown, { DropdownOption } from "./customdropdown";

export interface SeasonEntry {
  id: string;
  title: string;
  season: number;
  audioType?: "DUB" | "LEG" | "DUAL";
  episodeCount?: number;
}

interface SeasonSelectorProps {
  seasons: SeasonEntry[];
  currentId: string;
  onSelect: (id: string) => void;
  className?: string;
}

const audioLabels: Record<string, string> = {
  DUB: "🎙️ DUB",
  LEG: "📄 LEG",
  DUAL: "🎧 DUAL",
};

const SeasonSelector: React.FC<SeasonSelectorProps> = ({
  seasons,
  currentId,
  onSelect,
  className = "",
}) => {
  if (seasons.length <= 1) return null;

  // Sort by season number, then by audio type
  const sorted = [...seasons].sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return (a.audioType ?? "").localeCompare(b.audioType ?? "");
  });

  const options: DropdownOption[] = sorted.map((s) => ({
    value: s.id,
    label: `Temporada ${s.season}${s.audioType ? " — " + audioLabels[s.audioType] : ""}`,
    badge: s.episodeCount ? `${s.episodeCount} eps` : undefined,
    icon: (
      <span style={{
        width: "22px",
        height: "22px",
        borderRadius: "50%",
        background: "var(--accent, #e94560)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.7rem",
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {s.season}
      </span>
    ),
  }));

  return (
    <CustomDropdown
      options={options}
      value={currentId}
      onChange={onSelect}
      label="Temporada"
      className={className}
    />
  );
};

export default SeasonSelector;
