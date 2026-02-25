import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import Fuse from "fuse.js";
import { useAnimes } from "../hooks/useanimes";
import { useWatched } from "../hooks/usewatchlist";
import AnimeCard from "../components/animecard";
import SkeletonCard from "../components/skeletoncard";
import { Anime } from "../types";
import CustomDropdown from "../components/customdropdown";

const FUSE_OPTS = {
  keys:[{name:"title",weight:0.5},{name:"alt_titles",weight:0.3},{name:"tags",weight:0.1},{name:"genres",weight:0.1}],
  threshold:0.4, includeScore:true,
};

export default function SearchPage() {
  const [sp,setSp] = useSearchParams();
  const q = sp.get("q")||"";
  const [localQ,setLocalQ] = useState(q);
  const { animes, loading } = useAnimes();
  const { getWatchedCount } = useWatched();
  const fuseRef = useRef<Fuse<Anime>>();
  const debRef = useRef<ReturnType<typeof setTimeout>>();
  const [audioF,setAudioF] = useState("");
  const [statusF,setStatusF] = useState("");
  const [sortBy,setSortBy] = useState("relevance");
  const [minRating,setMinRating] = useState(0);

  useEffect(()=>{ fuseRef.current = new Fuse(animes,FUSE_OPTS); }, [animes]);
  useEffect(()=>{ setLocalQ(q); }, [q]);
  useEffect(()=>{ document.title = q?`Busca: ${q} — AnimeVerse`:"Explorar — AnimeVerse"; }, [q]);

  const results = useMemo(()=>{
    let list: Anime[];
    if (q.trim()&&fuseRef.current) list = fuseRef.current.search(q).map(r=>r.item);
    else list = [...animes];
    if (audioF) list = list.filter(a=>a.audioType===audioF);
    if (statusF) list = list.filter(a=>a.status===statusF);
    if (minRating>0) list = list.filter(a=>(a.rating??0)>=minRating);
    if (!q.trim()||sortBy!=="relevance") {
      if (sortBy==="newest") list.sort((a,b)=>(b.year??0)-(a.year??0));
      else if (sortBy==="rating") list.sort((a,b)=>(b.rating??0)-(a.rating??0));
      else if (sortBy==="title") list.sort((a,b)=>a.title.localeCompare(b.title));
    }
    return list;
  }, [q,animes,audioF,statusF,sortBy,minRating]);

  const handleQ = (v:string) => {
    setLocalQ(v);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(()=>setSp(v.trim()?{q:v.trim()}:{}), 250);
  };

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl md:text-4xl text-white mb-6 tracking-wide">
        {q?<>Resultados para <span className="text-brand-400">"{q}"</span></>:"Explorar Animes"}
      </h1>

      <div className="relative mb-4">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="search" value={localQ} onChange={e=>handleQ(e.target.value)}
          placeholder="Buscar anime, gênero, tag…" autoFocus className="input-field text-lg pl-12 py-4"/>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {[["","Todos"],["legendado","💬 LEG"],["dublado","🎙️ DUB"],["dual-audio","🎧 Dual"]].map(([v,l])=>(
          <button key={v} onClick={()=>setAudioF(v)} className={`btn-ghost text-sm py-1.5 px-3 ${audioF===v?"border-brand-500 text-brand-400":""}`}>{l}</button>
        ))}
        <div className="w-px bg-white/10"/>
        {[["","Todos"],["em-andamento","🟢 Em andamento"],["completo","🔵 Completo"]].map(([v,l])=>(
          <button key={v} onClick={()=>setStatusF(v)} className={`btn-ghost text-sm py-1.5 px-3 ${statusF===v?"border-brand-500 text-brand-400":""}`}>{l}</button>
        ))}
        <div className="w-px bg-white/10"/>
        {[0,7,8,9].map(v=>(
          <button key={v} onClick={()=>setMinRating(v)} className={`btn-ghost text-sm py-1.5 px-3 ${minRating===v?"border-brand-500 text-brand-400":""}`}>
            {v===0?"Qualquer nota":`≥ ${v}★`}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-6" >
        <p className="text-sm text-gray-500"><span className="text-white font-bold">{results.length}</span> animes</p>
        <div style={{ minWidth: 180 }} className="ml-auto">
          <CustomDropdown
             label=""
            options={[{value:"relevance",label:"Relevância"},{value:"newest",label:"Mais recentes"},{value:"rating",label:"Melhor avaliados"},{value:"title",label:"Título A-Z"}]}
             value={sortBy}
             onChange={(v) => setSortBy(v)}
             size="md"
            />
         </div>
      </div>

      {loading
        ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{Array.from({length:10}).map((_,i)=><SkeletonCard key={i}/>)}</div>
        : results.length>0
          ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">{results.map((a,i)=><AnimeCard key={a.id} anime={a} index={i} watchedCount={getWatchedCount(a.id)}/>)}</div>
          : <div className="text-center py-20"><p className="text-5xl mb-4">🔍</p><p className="text-xl text-gray-400 font-bold">Nenhum resultado</p></div>
      }
    </motion.div>
  );
}
