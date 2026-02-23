import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Episode } from "../types";
import { parseIframe, detectProvider } from "../utils/iframe";

interface Props { episode:Episode; animeTitle:string; cinemaMode?:boolean; onToggleCinema?:()=>void; }
const ICONS: Record<string,string> = {YouTube:"🎬",Vimeo:"🎞️","Google Drive":"📁",Dailymotion:"📺",Twitch:"🟣","Player Externo":"⚡"};

export default function EpisodePlayer({episode,animeTitle,cinemaMode,onToggleCinema}:Props) {
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState(false);
  const [showCode,setShowCode]=useState(false);
  const parsed=useMemo(()=>parseIframe(episode.embedUrl),[episode.embedUrl]);
  const provider=detectProvider(episode.embedUrl);
  const credit=episode.embedCredit||provider;
  useMemo(()=>{setLoaded(false);setError(false);},[episode.id]);

  return (
    <div className="w-full">
      {/* Player box */}
      <div className={`relative w-full aspect-video bg-dark-900 rounded-xl overflow-hidden shadow-2xl border transition-all duration-500 ${cinemaMode?"border-brand-500/30 shadow-brand-500/10":"border-white/5"}`}>
        {/* Loading skeleton */}
        <AnimatePresence>
          {!loaded&&!error&&(
            <motion.div exit={{opacity:0}} className="absolute inset-0 skeleton z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-brand-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <p className="text-gray-500 text-sm">Carregando player{parsed.isIframeHtml?" (iframe)":""}…</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Error */}
        {error&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-dark-800 z-10">
            <span className="text-4xl">😵</span>
            <p className="text-gray-400 text-sm font-semibold">Player não carregou</p>
            <a href={parsed.src} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm py-1.5 px-4">Abrir fonte original ↗</a>
          </div>
        )}
        {/* iframe */}
        {parsed.src&&(
          <motion.iframe key={episode.id} src={parsed.src}
            title={`${animeTitle} — ${episode.title}`}
            allow={parsed.allow} allowFullScreen={parsed.allowFullScreen}
            className="absolute inset-0 w-full h-full"
            initial={{opacity:0}} animate={{opacity:loaded?1:0}} transition={{duration:0.4}}
            onLoad={()=>setLoaded(true)} onError={()=>setError(true)}
            style={{border:0}} referrerPolicy="no-referrer-when-downgrade"/>
        )}
        {/* Cinema mode toggle (floating) */}
        {onToggleCinema&&(
          <button onClick={onToggleCinema}
            className="absolute bottom-3 right-3 p-2 bg-black/60 hover:bg-black/80 rounded-lg border border-white/20 text-white text-xs backdrop-blur-sm transition-all z-20 opacity-0 group-hover:opacity-100"
            title={cinemaMode?"Sair do modo cinema":"Modo cinema"}>
            {cinemaMode?"🌅":"🌙"}
          </button>
        )}
      </div>

      {/* Info bar */}
      <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:0.25}}
        className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span className="text-base">{ICONS[provider]??"⚡"}</span>
          <span>Fonte: <span className="text-gray-200 font-semibold">{credit}</span></span>
          {parsed.isIframeHtml&&<span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">iframe ✓</span>}
        </div>
        <div className="flex gap-3 items-center">
          {onToggleCinema&&(
            <button onClick={onToggleCinema} className={`text-xs flex items-center gap-1 transition-colors ${cinemaMode?"text-brand-400":"text-gray-500 hover:text-gray-300"}`}>
              {cinemaMode?"🌅 Sair do cinema":"🌙 Modo Cinema"}
            </button>
          )}
          <button onClick={()=>setShowCode(v=>!v)} className="text-xs text-gray-600 hover:text-gray-300 flex items-center gap-1 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
            {showCode?"Ocultar":"iframe"}
          </button>
          <a href={parsed.src} target="_blank" rel="noopener noreferrer"
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            Fonte
          </a>
        </div>
      </motion.div>

      {/* iframe code */}
      <AnimatePresence>
        {showCode&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
            <div className="mt-2 rounded-xl bg-dark-800 border border-white/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Código iframe</span>
                <button onClick={()=>navigator.clipboard.writeText(`<iframe src="${parsed.src}" width="800" height="450" frameborder="0" allowfullscreen></iframe>`)}
                  className="text-xs text-brand-400 hover:text-brand-300">Copiar</button>
              </div>
              <code className="block text-xs font-mono text-emerald-400 break-all whitespace-pre-wrap">
                {`<iframe src="${parsed.src}" width="800" height="450" frameborder="0" allowfullscreen></iframe>`}
              </code>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
