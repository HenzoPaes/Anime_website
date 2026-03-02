import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAnimes, saveAnime, deleteAnime, fetchBackups, restoreBackup } from "../hooks/useanimes";
import { parseIframe, detectProvider } from "../utils/iframe";
import { Anime, Episode } from "../types";

const BLANK: Anime = {
  id: "", title: "", alt_titles: [], cover: "", banner: "", synopsis: "",
  genres: [], year: new Date().getFullYear(), status: "em-andamento",
  rating: 8.0, audioType: "dublado", episodeCount: 0, episodes: [], tags: [], locale: "pt-BR",
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── EpisodeRow (Redesign) ──────────────────────────────────────────────────────
function EpisodeRow({ ep, onUpdate, onRemove }: { ep: Episode; onUpdate: (f: keyof Episode, v: string | number) => void; onRemove: () => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const parsed = ep.embedUrl ? parseIframe(ep.embedUrl) : null;
  const provider = ep.embedUrl ? detectProvider(ep.embedUrl) : "";

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:border-red-500/20 transition-all group"
    >
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-24">
          <label className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 block">Nº EP</label>
          <input type="number" value={ep.number} min={1}
            onChange={e => onUpdate("number", Number(e.target.value))}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-red-500 outline-none transition-all text-center font-bold" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Título do Episódio (Opcional)</label>
          <input value={ep.title} onChange={e => onUpdate("title", e.target.value)}
            placeholder="Ex: O Início da Jornada" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-red-500 outline-none transition-all" />
        </div>
        <div className="flex items-end">
          <button onClick={onRemove} className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all border border-red-500/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between items-center mb-1">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Iframe / Player URL</label>
          {provider && <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded uppercase">{provider}</span>}
        </div>
        <textarea value={ep.embedUrl} onChange={e => onUpdate("embedUrl", e.target.value)} rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-red-500 outline-none transition-all font-mono text-xs resize-none"
          placeholder="Cole o código <iframe> ou a URL direta aqui..." />
      </div>

      <div className="mt-3 flex justify-between items-center">
        <input value={ep.embedCredit || ""} onChange={e => onUpdate("embedCredit", e.target.value)}
          placeholder="Créditos da fonte..." className="bg-transparent text-xs text-gray-500 outline-none border-b border-transparent focus:border-red-500 w-1/3" />
        
        {parsed?.src && (
          <button type="button" onClick={() => setShowPreview(!showPreview)}
            className={`text-xs font-black uppercase tracking-tighter px-4 py-1.5 rounded-lg transition-all ${showPreview ? "bg-red-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
            {showPreview ? "Fechar Preview" : "Visualizar Player"}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showPreview && parsed?.src && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 overflow-hidden">
            <div className="aspect-video bg-black rounded-xl border border-white/10 overflow-hidden shadow-2xl">
              <iframe src={parsed.src} title="Preview" className="w-full h-full" allowFullScreen />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { animes, loading, refetch } = useAnimes();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [tab, setTab] = useState<"list" | "edit" | "backups">("list");
  const [editing, setEditing] = useState<Anime>(BLANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [backups, setBackups] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [genreInput, setGenreInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  useEffect(() => { document.title = "Console — AnimeVerse"; }, []);

  const flash = (type: "ok" | "err", text: string) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000); };

  const handleSave = async () => {
    if (!editing.id || !editing.title) return flash("err", "ID e Título são obrigatórios.");
    setSaving(true);
    try {
      const res = await saveAnime(editing, apiKey);
      if (res.success) {
        flash("ok", res.message);
        localStorage.setItem("adminKey", apiKey);
        await refetch(); setTab("list");
      } else flash("err", res.message || "Erro ao salvar");
    } catch { flash("err", "Erro de rede."); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteAnime(id, apiKey);
      if (res.success) { flash("ok", res.message); await refetch(); }
      else flash("err", res.message);
    } catch { flash("err", "Erro de rede."); }
    setConfirmDel(null);
  };

  const loadBackups = useCallback(async () => {
    try { setBackups(await fetchBackups(apiKey)); }
    catch { flash("err", "Erro ao carregar backups."); }
  }, [apiKey]);

  const edit = (a: Anime) => { setEditing({ ...a }); setGenreInput(a.genres.join(", ")); setTagInput((a.tags || []).join(", ")); setTab("edit"); window.scrollTo(0,0); };
  const newA = () => { setEditing({ ...BLANK }); setGenreInput(""); setTagInput(""); setTab("edit"); };

  const addEp = () => {
    setEditing(e => ({
      ...e,
      episodes: [...e.episodes, { id: `ep${Date.now()}`, number: e.episodes.length + 1, title: "", embedUrl: "", embedCredit: "" }]
    }));
  };
  const updEp = (i: number, f: keyof Episode, v: string | number) => setEditing(e => { const eps = [...e.episodes]; eps[i] = { ...eps[i], [f]: v }; return { ...e, episodes: eps }; });
  const remEp = (i: number) => setEditing(e => ({ ...e, episodes: e.episodes.filter((_, j) => j !== i) }));

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-red-600/30 pb-20">
      {/* Background Decorativo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-red-600/5 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-10">
        {/* Header Console */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
              <span className="bg-red-600 px-2 py-0.5 rounded-lg shadow-[0_0_15px_rgba(220,38,38,0.4)]">SYSTEM</span> 
              ADMINSTRATOR
            </h1>
            <p className="text-gray-500 text-xs mt-1 font-mono uppercase tracking-widest">Conectado ao database: <span className="text-red-500">animes.json</span></p>
          </div>
          
          <div className="relative group">
            <div className="absolute -inset-1 bg-red-600/20 rounded-xl blur group-hover:bg-red-600/40 transition-all" />
            <div className="relative bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3">
              <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.47 4.34-3.1 8.24-7 9.5V12H5V6.3l7-3.11v8.8z"/></svg>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="Access Key" className="bg-transparent outline-none text-xs font-mono w-40" />
            </div>
          </div>
        </header>

        {/* Notificações (Toast) */}
        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 ${msg.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
              {msg.type === "ok" ? "✓" : "⚠"} {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs Estilizadas */}
        <nav className="flex gap-2 mb-10 bg-white/[0.03] p-1.5 rounded-2xl w-fit border border-white/5">
          {[["list", "Gerenciar"], ["edit", "Editor"], ["backups", "Backups"]].map(([t, l]) => (
            <button key={t} onClick={() => { setTab(t as any); if (t === "backups") loadBackups(); }}
              className={`px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === t ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "text-gray-500 hover:text-white"}`}>
              {l}
            </button>
          ))}
        </nav>

        {/* LIST TAB */}
        {tab === "list" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-xl font-black uppercase tracking-tighter">Catálogo Ativo ({animes.length})</h2>
              <button onClick={newA} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                Novo Registro
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
                {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {animes.map(a => (
                  <div key={a.id} className="bg-white/[0.03] border border-white/5 p-4 rounded-3xl flex items-center gap-4 hover:bg-white/[0.05] transition-all group">
                    <img src={a.cover} alt="" className="w-16 h-20 object-cover rounded-xl shadow-lg border border-white/10" onError={e => e.currentTarget.src = 'https://placehold.co/400x600/000/red?text=No+Cover'} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-white truncate text-lg uppercase tracking-tighter">{a.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-[10px] font-black uppercase tracking-widest">
                        <span className="text-red-500">{a.year}</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-400">{a.episodeCount} EPISÓDIOS</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-yellow-500">★ {a.rating}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => edit(a)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => setConfirmDel(a.id)} className="p-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-lg transition-all border border-red-500/10">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* EDIT TAB */}
        {tab === "edit" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10">
            {/* Meta-Informações */}
            <section className="bg-white/[0.02] border border-white/5 p-8 rounded-[2rem]">
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-red-600 mb-8 flex items-center gap-4">
                <span className="h-px w-10 bg-red-600" /> Informações Primárias
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">ID Único (Slug)</label>
                   <div className="flex gap-2">
                      <input value={editing.id} onChange={e => setEditing(x => ({ ...x, id: e.target.value }))} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white font-mono text-sm" />
                      <button onClick={() => editing.title && setEditing(x => ({ ...x, id: slugify(x.title) }))} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">🚀</button>
                   </div>
                </div>
                <div className="md:col-span-2">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Título Principal</label>
                   <input value={editing.title} onChange={e => setEditing(x => ({ ...x, title: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white" />
                </div>
                <div className="md:col-span-3">
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Títulos Alternativos (separar por vírgula)</label>
                   <input value={(editing.alt_titles || []).join(", ")} onChange={e => setEditing(x => ({ ...x, alt_titles: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
                <div>
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Ano</label>
                   <input type="number" value={editing.year} onChange={e => setEditing(x => ({ ...x, year: Number(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-center" />
                </div>
                <div>
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Nota ★</label>
                   <input type="number" step="0.1" value={editing.rating} onChange={e => setEditing(x => ({ ...x, rating: Number(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-center" />
                </div>
                <div>
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Total Episódios</label>
                   <input type="number" value={editing.episodeCount} onChange={e => setEditing(x => ({ ...x, episodeCount: Number(e.target.value) }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-center" />
                </div>
                <div>
                   <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Áudio</label>
                   <select value={editing.audioType} onChange={e => setEditing(x => ({ ...x, audioType: e.target.value as any }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white outline-none appearance-none">
                      <option value="dublado">🎙 Dublado</option>
                      <option value="legendado">💬 Legendado</option>
                      <option value="dual-audio">🎧 Dual Áudio</option>
                   </select>
                </div>
              </div>
            </section>

            {/* Media & Art */}
            <section className="bg-white/[0.02] border border-white/5 p-8 rounded-[2rem]">
               <h2 className="text-xs font-black uppercase tracking-[0.3em] text-red-600 mb-8 flex items-center gap-4">
                <span className="h-px w-10 bg-red-600" /> Mídia e Arte
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Capa URL (Poster)</label>
                      <input value={editing.cover} onChange={e => setEditing(x => ({ ...x, cover: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Banner URL (Background)</label>
                      <input value={editing.banner || ""} onChange={e => setEditing(x => ({ ...x, banner: e.target.value }))} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white text-xs" />
                    </div>
                 </div>
                 <div className="flex gap-4">
                    <div className="w-24 h-32 bg-black/60 rounded-xl border border-white/10 overflow-hidden flex-shrink-0">
                       <img src={editing.cover} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 h-32 bg-black/60 rounded-xl border border-white/10 overflow-hidden">
                       <img src={editing.banner} className="w-full h-full object-cover" />
                    </div>
                 </div>
              </div>
            </section>

            {/* Episodes Management */}
            <section className="bg-white/[0.02] border border-white/5 p-8 rounded-[2rem]">
               <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] text-red-600 flex items-center gap-4">
                    <span className="h-px w-10 bg-red-600" /> Lista de Episódios
                  </h2>
                  <button onClick={addEp} className="bg-white/5 hover:bg-white/10 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all">
                    + Adicionar Episódio
                  </button>
               </div>
               
               <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence>
                    {editing.episodes.map((ep, i) => (
                      <EpisodeRow key={ep.id || i} ep={ep} onUpdate={(f, v) => updEp(i, f, v)} onRemove={() => remEp(i)} />
                    ))}
                  </AnimatePresence>
               </div>
            </section>

            {/* Actions */}
            <div className="sticky bottom-6 flex gap-4 bg-black/80 backdrop-blur-xl p-4 rounded-3xl border border-white/10 shadow-2xl">
              <button onClick={() => setTab("list")} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest py-4 rounded-2xl transition-all">Descartar</button>
              <button onClick={handleSave} disabled={saving} className="flex-[2] bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest py-4 rounded-2xl transition-all shadow-[0_0_30px_rgba(220,38,38,0.3)] disabled:opacity-50 flex items-center justify-center gap-3">
                {saving ? "Salvando Dados..." : "Confirmar Alterações"}
              </button>
            </div>
          </motion.div>
        )}

        {/* BACKUPS TAB */}
        {tab === "backups" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
             <div className="bg-white/[0.02] border border-white/5 p-8 rounded-[2rem]">
               <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xs font-black uppercase tracking-[0.3em] text-red-600 flex items-center gap-4">
                    <span className="h-px w-10 bg-red-600" /> Arquivos de Segurança
                  </h2>
                  <button onClick={loadBackups} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400">↻</button>
               </div>
               
               <div className="space-y-3">
                  {backups.map(name => (
                    <div key={name} className="bg-black/40 border border-white/10 p-5 rounded-2xl flex items-center justify-between group">
                       <div>
                          <p className="font-mono text-xs text-white uppercase tracking-tighter">{name}</p>
                          <p className="text-[10px] text-gray-500 font-black uppercase mt-1">{name.replace("backup_","").replace(/-/g,":").slice(0,19).replace("T"," • ")}</p>
                       </div>
                       <button onClick={() => { if(confirm(`Restaurar ${name}?`)) restoreBackup(name, apiKey).then(r => { if(r.success){flash("ok", r.message); refetch();}else flash("err", r.message); }); }}
                         className="px-4 py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-red-500/10">
                         Restaurar
                       </button>
                    </div>
                  ))}
               </div>
             </div>
          </motion.div>
        )}

        {/* Confirm Modal */}
        <AnimatePresence>
          {confirmDel && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#0a0a0a] border border-red-500/30 p-10 rounded-[2.5rem] max-w-md w-full text-center">
                  <div className="w-20 h-20 bg-red-600/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-600/30">
                     <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Eliminar Registro?</h3>
                  <p className="text-gray-500 text-sm mb-8 leading-relaxed">Você está prestes a remover <span className="text-white font-bold">{confirmDel}</span>. Esta ação criará um backup automático, mas o anime sairá do catálogo público.</p>
                  <div className="flex gap-4">
                    <button onClick={() => setConfirmDel(null)} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Abortar</button>
                    <button onClick={() => handleDelete(confirmDel!)} className="flex-1 py-3 bg-red-600 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-red-600/20">Confirmar</button>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}