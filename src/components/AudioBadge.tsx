import { AudioType } from "../types";
const CFG: Record<string,{label:string;cls:string}> = {
  legendado:{label:"💬 LEG",cls:"bg-blue-600/80 text-blue-100 border-blue-400/30"},
  dublado:{label:"🎙️ DUB",cls:"bg-purple-600/80 text-purple-100 border-purple-400/30"},
  "dual-audio":{label:"🎧 DUB+LEG",cls:"bg-emerald-600/80 text-emerald-100 border-emerald-400/30"},
};
export default function AudioBadge({type,size="md"}:{type:AudioType;size?:"sm"|"md"}) {
  const cfg=CFG[type]||{label:"🎌",cls:"bg-gray-600/80 text-gray-100 border-gray-400/30"};
  return <span className={`inline-flex items-center rounded-full border font-bold tracking-wider backdrop-blur-sm ${cfg.cls} ${size==="sm"?"px-1.5 py-0.5 text-[10px]":"px-2 py-1 text-xs"}`}>{cfg.label}</span>;
}
