import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAnimes, saveAnime, deleteAnime, fetchBackups, restoreBackup } from "../hooks/useAnimes";
import { useWatched } from "../hooks/useWatchlist";
import { parseIframe, detectProvider } from "../utils/iframe";
import { Anime, Episode } from "../types";

const BLANK: Anime = {
  id:"", title:"", alt_titles:[], cover:"", banner:"", synopsis:"",
  genres:[], year: new Date().getFullYear(), status:"em-andamento",
  rating:8.0, audioType:"dublado", episodeCount:0, episodes:[], tags:[], locale:"pt-BR",
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

// ── EpisodeRow ────────────────────────────────────────────────────────────────
function EpisodeRow({ ep, onUpdate, onRemove }:
  { ep: Episode; onUpdate:(f:keyof Episode,v:string|number)=>void; onRemove:()=>void }) {
  const [showPreview, setShowPreview] = useState(false);
  const parsed = ep.embedUrl ? parseIframe(ep.embedUrl) : null;
  const provider = ep.embedUrl ? detectProvider(ep.embedUrl) : "";

  return (
    <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,x:10}}
      className="glass rounded-xl p-4 space-y-3 border border-white/5">

      <div className="flex gap-3">
        <div className="w-20 flex-shrink-0">
          <label className="text-xs text-gray-600 mb-0.5 block">Ep. Nº</label>
          <input type="number" value={ep.number} min={1}
            onChange={e=>onUpdate("number",Number(e.target.value))}
            className="input-field text-sm text-center py-1.5" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-600 mb-0.5 block">Título</label>
          <input value={ep.title} onChange={e=>onUpdate("title",e.target.value)}
            placeholder="Título do episódio" className="input-field text-sm py-1.5" />
        </div>
        <button onClick={onRemove} className="mt-5 p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-600">
            Link do Player <span className="text-gray-700">— URL ou código &lt;iframe&gt; completo</span>
          </label>
          <div className="flex items-center gap-1.5">
            {parsed?.isIframeHtml && (
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold uppercase">
                iframe ✓
              </span>
            )}
            {provider && (
              <span className="text-[10px] bg-white/5 border border-white/10 text-gray-500 px-1.5 py-0.5 rounded-full font-bold uppercase">
                {provider}
              </span>
            )}
          </div>
        </div>
        <textarea value={ep.embedUrl} onChange={e=>onUpdate("embedUrl",e.target.value)} rows={3}
          spellCheck={false}
          placeholder={"URL direta:\nhttps://www.youtube.com/embed/XXXXXXX\n\nou código iframe completo:\n<iframe src=\"https://player.site.com/embed/id\" width=\"800\" height=\"450\" frameborder=\"0\" allowfullscreen></iframe>"}
          className="input-field text-xs font-mono resize-none leading-relaxed" />
        {parsed?.src && (
          <p className="mt-1 text-xs flex gap-1.5">
            <span className="text-gray-600">src:</span>
            <code className="text-emerald-400 font-mono break-all">{parsed.src}</code>
          </p>
        )}
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs text-gray-600 mb-0.5 block">Crédito / Fonte</label>
          <input value={ep.embedCredit||""} onChange={e=>onUpdate("embedCredit",e.target.value)}
            placeholder={`${provider||"Player"} • Nome do site`} className="input-field text-sm py-1.5" />
        </div>
        {parsed?.src && (
          <button type="button" onClick={()=>setShowPreview(v=>!v)}
            className={`btn-ghost text-xs py-2 px-3 flex-shrink-0 flex items-center gap-1 ${showPreview?"border-brand-500 text-brand-400":""}`}>
            👁 {showPreview?"Fechar":"Preview"}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showPreview && parsed?.src && (
          <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
            <div className="rounded-xl overflow-hidden border border-white/10 bg-dark-900">
              <div className="px-3 py-1.5 bg-dark-800 border-b border-white/5 flex items-center justify-between">
                <code className="text-xs text-gray-500 truncate">{parsed.src}</code>
                <span className="text-xs text-emerald-400 font-bold ml-2 flex-shrink-0">Ao vivo</span>
              </div>
              <div className="aspect-video">
                <iframe src={parsed.src} title="Preview" allow={parsed.allow}
                  allowFullScreen className="w-full h-full" style={{border:0}}
                  referrerPolicy="no-referrer-when-downgrade" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { animes, loading, refetch } = useAnimes();
  const [apiKey, setApiKey] = useState(()=>localStorage.getItem("adminKey")||"dev-key");
  const [tab, setTab] = useState<"list"|"edit"|"backups">("list");
  const [editing, setEditing] = useState<Anime>(BLANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{type:"ok"|"err";text:string}|null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string|null>(null);
  const [genreInput, setGenreInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  useEffect(()=>{ document.title="Admin — AnimeVerse"; },[]);

  const flash = (type:"ok"|"err", text:string) => { setMsg({type,text}); setTimeout(()=>setMsg(null),4000); };

  const handleSave = async () => {
    if (!editing.id||!editing.title) return flash("err","ID e Título são obrigatórios.");
    setSaving(true);
    try {
      const res = await saveAnime(editing, apiKey);
      if (res.success) {
        flash("ok", res.message);
        localStorage.setItem("adminKey", apiKey);
        await refetch(); setTab("list");
      } else flash("err", res.message||"Erro ao salvar");
    } catch { flash("err","Erro de rede."); }
    setSaving(false);
  };

  const handleDelete = async (id:string) => {
    try {
      const res = await deleteAnime(id, apiKey);
      if (res.success) { flash("ok",res.message); await refetch(); }
      else flash("err",res.message);
    } catch { flash("err","Erro de rede."); }
    setConfirmDel(null);
  };

  const loadBackups = useCallback(async ()=>{
    try { setBackups(await fetchBackups(apiKey)); }
    catch { flash("err","Erro ao carregar backups."); }
  },[apiKey]);

  const edit = (a:Anime) => { setEditing({...a}); setGenreInput(a.genres.join(", ")); setTagInput((a.tags||[]).join(", ")); setTab("edit"); };
  const newA  = () => { setEditing({...BLANK}); setGenreInput(""); setTagInput(""); setTab("edit"); };

  const addEp = () => {
  setEditing(e => {
      if (!e) return e;

      return {
        ...e,
        episodes: [
          ...e.episodes,
          {
            id: `ep${Date.now()}`,
            number: e.episodes.length + 1,
            title: "",
            embedUrl: "",
            embedCredit: ""
          }
        ]
      };
    });
  };
  const updEp = (i:number, f:keyof Episode, v:string|number) => setEditing(e=>{ const eps=[...e.episodes]; eps[i]={...eps[i],[f]:v}; return {...e,episodes:eps}; });
  const remEp = (i:number) => setEditing(e=>({...e,episodes:e.episodes.filter((_,j)=>j!==i)}));

  return (
    <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0}}
      className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-white tracking-wide">Painel Admin</h1>
          <p className="text-gray-500 text-sm">Gerencie animes e episódios • os dados são salvos em <code className="text-brand-400">animes.json</code></p>
        </div>
        <div className="flex items-center gap-2">
          <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
            placeholder="API Key" className="input-field text-sm w-44 py-1.5" />
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${apiKey?"bg-green-500":"bg-red-500"}`}/>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {msg && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            className={`mb-4 p-4 rounded-xl text-sm font-semibold ${msg.type==="ok"?"bg-green-500/20 border border-green-500/30 text-green-300":"bg-red-500/20 border border-red-500/30 text-red-300"}`}>
            {msg.type==="ok"?"✓ ":"✗ "}{msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 glass rounded-xl p-1 w-fit">
        {[["list","📋 Lista"],["edit","✏️ Editar"],["backups","💾 Backups"]].map(([t,l])=>(
          <button key={t} onClick={()=>{ setTab(t as typeof tab); if(t==="backups")loadBackups(); }}
            className={`py-2 px-4 rounded-lg text-sm font-semibold transition-all ${tab===t?"bg-brand-500 text-white":"text-gray-400 hover:text-white"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* LIST */}
      {tab==="list" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">{animes.length} animes</p>
            <button onClick={newA} className="btn-primary text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
              Novo Anime
            </button>
          </div>
          {loading ? <p className="text-gray-500">Carregando…</p> : (
            <div className="space-y-2">
              {animes.map(a=>(
                <motion.div key={a.id} initial={{opacity:0}} animate={{opacity:1}}
                  className="glass rounded-xl p-4 flex items-center gap-4">
                  <img src={a.cover} alt="" className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                    onError={e=>{(e.target as HTMLImageElement).style.display="none";}} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{a.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.year} • {a.episodeCount} eps • {a.audioType} • ★{a.rating} • <code className="text-brand-500">{a.id}</code></p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={()=>edit(a)} className="btn-ghost text-sm py-1.5 px-3">Editar</button>
                    <button onClick={()=>setConfirmDel(a.id)}
                      className="py-1.5 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold border border-red-500/20 transition-colors">
                      Excluir
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          <AnimatePresence>
            {confirmDel && (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
                onClick={()=>setConfirmDel(null)}>
                <motion.div initial={{scale:0.9}} animate={{scale:1}} onClick={e=>e.stopPropagation()}
                  className="glass rounded-2xl p-6 max-w-sm w-full border border-red-500/20">
                  <h3 className="font-bold text-xl text-white mb-2">Confirmar exclusão</h3>
                  <p className="text-gray-400 text-sm mb-6">Excluir <strong className="text-white">{confirmDel}</strong>? Um backup será criado automaticamente.</p>
                  <div className="flex gap-3">
                    <button onClick={()=>setConfirmDel(null)} className="btn-ghost flex-1">Cancelar</button>
                    <button onClick={()=>handleDelete(confirmDel!)}
                      className="flex-1 py-2 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-sm">Excluir</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* EDIT */}
      {tab==="edit" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">ID *</label>
              <div className="flex gap-2">
                <input value={editing.id} onChange={e=>setEditing(x=>({...x,id:e.target.value}))}
                  placeholder="anime-001" className="input-field flex-1 font-mono text-sm py-1.5" />
                <button onClick={()=>editing.title&&setEditing(x=>({...x,id:slugify(x.title)+"-001"}))}
                  className="btn-ghost text-xs py-1.5 px-2">Auto</button>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Título *</label>
              <input value={editing.title} onChange={e=>setEditing(x=>({...x,title:e.target.value}))}
                placeholder="Título do anime" className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Títulos Alt. (vírgula)</label>
              <input value={(editing.alt_titles||[]).join(", ")}
                onChange={e=>setEditing(x=>({...x,alt_titles:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}))}
                placeholder="Título EN, 日本語タイトル" className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">URL da Capa</label>
              <input value={editing.cover} onChange={e=>setEditing(x=>({...x,cover:e.target.value}))}
                placeholder="https://…" className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">URL do Banner</label>
              <input value={editing.banner||""} onChange={e=>setEditing(x=>({...x,banner:e.target.value}))}
                placeholder="https://…" className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Ano</label>
              <input type="number" value={editing.year} min={1960} max={2030}
                onChange={e=>setEditing(x=>({...x,year:Number(e.target.value)}))}
                className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Nota (0-10)</label>
              <input type="number" value={editing.rating} step={0.01} min={0} max={10}
                onChange={e=>setEditing(x=>({...x,rating:Number(e.target.value)}))}
                className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Total de Episódios</label>
              <input type="number" value={editing.episodeCount} min={0}
                onChange={e=>setEditing(x=>({...x,episodeCount:Number(e.target.value)}))}
                className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Status</label>
              <select value={editing.status} onChange={e=>setEditing(x=>({...x,status:e.target.value as Anime["status"]}))}
                className="input-field py-1.5 text-sm">
                <option value="em-andamento">Em andamento</option>
                <option value="completo">Completo</option>
                <option value="pausado">Pausado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Tipo de Áudio</label>
              <select value={editing.audioType} onChange={e=>setEditing(x=>({...x,audioType:e.target.value as Anime["audioType"]}))}
                className="input-field py-1.5 text-sm">
                <option value="legendado">💬 Legendado</option>
                <option value="dublado">🎙️ Dublado</option>
                <option value="dual-audio">🎧 Dual (Dub+Leg)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Gêneros (vírgula)</label>
              <input value={genreInput}
                onChange={e=>{ setGenreInput(e.target.value); setEditing(x=>({...x,genres:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})); }}
                placeholder="comédia, romance, ação" className="input-field py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Tags (vírgula)</label>
              <input value={tagInput}
                onChange={e=>{ setTagInput(e.target.value); setEditing(x=>({...x,tags:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})); }}
                placeholder="shounen, romance, harem" className="input-field py-1.5 text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Sinopse</label>
            <textarea value={editing.synopsis} rows={4}
              onChange={e=>setEditing(x=>({...x,synopsis:e.target.value}))}
              className="input-field resize-none" />
          </div>

          {/* Episodes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">Episódios ({editing.episodes.length})</h3>
              <button onClick={addEp} className="btn-ghost text-sm py-1.5 px-3 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                </svg>
                Adicionar Ep.
              </button>
            </div>
            <div className="space-y-3">
              <AnimatePresence>
                {editing.episodes.map((ep,i)=>(
                  <EpisodeRow key={ep.id||i} ep={ep}
                    onUpdate={(f,v)=>updEp(i,f,v)} onRemove={()=>remEp(i)} />
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button onClick={()=>setTab("list")} className="btn-ghost">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Salvando…</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>Salvar em animes.json</>
              }
            </button>
          </div>
        </div>
      )}

      {/* BACKUPS */}
      {tab==="backups" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-white">Histórico de Backups</h2>
            <button onClick={loadBackups} className="btn-ghost text-sm py-1.5 px-3">↻ Atualizar</button>
          </div>
          {backups.length===0
            ? <div className="glass rounded-xl p-8 text-center"><p className="text-gray-500">Nenhum backup ainda.</p></div>
            : <div className="space-y-2">
                {backups.map(name=>(
                  <div key={name} className="glass rounded-xl px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm text-white">{name}</p>
                      <p className="text-xs text-gray-500">{name.replace("backup_","").replace(/-/g,":").slice(0,19).replace("T"," às ")}</p>
                    </div>
                    <button onClick={()=>{ if(confirm(`Restaurar ${name}?`)) restoreBackup(name,apiKey).then(r=>{ if(r.success){flash("ok",r.message);refetch();}else flash("err",r.message); }); }}
                      className="btn-ghost text-sm py-1.5 px-3 text-yellow-400 border-yellow-500/20">
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </motion.div>
  );
}
