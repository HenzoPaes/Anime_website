import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Fuse from "fuse.js";
import { Anime } from "../types";
import AudioBadge from "./AudioBadge";

const FUSE_OPTS = {
  keys:[
    {name:"title",weight:0.5},{name:"alt_titles",weight:0.3},
    {name:"tags",weight:0.15},{name:"genres",weight:0.15},{name:"synopsis",weight:0.1},
  ],
  threshold:0.45,includeScore:true,minMatchCharLength:2,
};

interface Props { animes:Anime[]; compact?:boolean; autoFocus?:boolean; placeholder?:string; }

export default function SearchBar({animes,compact,autoFocus,placeholder="Buscar anime…"}:Props) {
  const [q,setQ]=useState("");
  const [results,setResults]=useState<Anime[]>([]);
  const [open,setOpen]=useState(false);
  const [sel,setSel]=useState(-1);
  const inputRef=useRef<HTMLInputElement>(null);
  const fuseRef=useRef<Fuse<Anime>>();
  const debRef=useRef<ReturnType<typeof setTimeout>>();
  const navigate=useNavigate();

  useEffect(()=>{ fuseRef.current=new Fuse(animes,FUSE_OPTS); },[animes]);
  useEffect(()=>{ if(autoFocus) inputRef.current?.focus(); },[autoFocus]);

  const doSearch=useCallback((v:string)=>{
    if(!v.trim()||!fuseRef.current){setResults([]);setOpen(false);return;}
    const res=fuseRef.current.search(v).slice(0,7).map(r=>r.item);
    setResults(res);setOpen(res.length>0);setSel(-1);
  },[]);

  const handleChange=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const v=e.target.value;setQ(v);
    clearTimeout(debRef.current);
    debRef.current=setTimeout(()=>doSearch(v),200);
  };

  const go=(anime:Anime)=>{ navigate(`/anime/${encodeURIComponent(anime.id)}`);setQ("");setOpen(false); };

  const handleKey=(e:React.KeyboardEvent)=>{
    if(!open){if(e.key==="Enter"&&q.trim()){navigate(`/search?q=${encodeURIComponent(q)}`);setOpen(false);}return;}
    if(e.key==="ArrowDown"){e.preventDefault();setSel(s=>Math.min(s+1,results.length-1));}
    else if(e.key==="ArrowUp"){e.preventDefault();setSel(s=>Math.max(s-1,-1));}
    else if(e.key==="Enter"){e.preventDefault();if(sel>=0)go(results[sel]);else if(q.trim()){navigate(`/search?q=${encodeURIComponent(q)}`);setOpen(false);}}
    else if(e.key==="Escape")setOpen(false);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input ref={inputRef} type="search" value={q} onChange={handleChange}
          onKeyDown={handleKey} onFocus={()=>q&&doSearch(q)}
          onBlur={()=>setTimeout(()=>setOpen(false),150)}
          placeholder={placeholder}
          className={`input-field pl-10 pr-8 ${compact?"text-sm py-1.5":""}`}
          aria-label="Buscar anime"/>
        {q&&<button onClick={()=>{setQ("");setResults([]);setOpen(false);}}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg></button>}
      </div>

      <AnimatePresence>
        {open&&(
          <motion.ul initial={{opacity:0,y:-6,scale:0.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-6,scale:0.98}}
            transition={{duration:0.15}} className="absolute top-full left-0 right-0 mt-2 glass-strong rounded-xl overflow-hidden z-50 shadow-2xl shadow-black/60">
            {results.map((anime,i)=>(
              <motion.li key={anime.id} initial={{opacity:0,x:-8}} animate={{opacity:1,x:0}} transition={{delay:i*0.03}}
                onClick={()=>go(anime)}
                className={`flex items-center gap-3 p-3 cursor-pointer transition-all border-b border-white/5 last:border-0
                  ${i===sel?"bg-brand-500/20 border-l-2 border-l-brand-500":"hover:bg-white/5"}`}>
                <img src={anime.cover} alt="" className="w-9 h-12 object-cover rounded-lg flex-shrink-0"
                  onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{anime.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5 flex-wrap">
                    {anime.year&&<span>{anime.year}</span>}
                    {anime.rating&&<span className="text-yellow-500">★{anime.rating}</span>}
                    {anime.audioType&&<AudioBadge type={anime.audioType} size="sm"/>}
                  </div>
                </div>
              </motion.li>
            ))}
            <li onClick={()=>{navigate(`/search?q=${encodeURIComponent(q)}`);setOpen(false);}}
              className="p-3 text-center text-sm text-brand-400 hover:bg-white/5 cursor-pointer font-semibold">
              Ver todos os resultados para "{q}" →
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
