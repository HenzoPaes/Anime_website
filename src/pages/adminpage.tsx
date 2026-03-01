// src/pages/AdminPage.tsx
// Painel admin completo — conectado ao servidor MongoDB via API
// Abas: Dashboard | Catálogo | Editor | Logs | Usuários | PageConfig | Backup

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAnimes } from "../hooks/useanimes";
import { parseIframe, detectProvider } from "../utils/iframe";
import { Anime, Episode } from "../types";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL ?? "";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BLANK: Anime = {
  id: "", title: "", alt_titles: [], cover: "", banner: "", synopsis: "",
  genres: [], year: new Date().getFullYear(), status: "em-andamento",
  rating: 8.0, audioType: "dublado", episodeCount: 0, episodes: [], tags: [], locale: "pt-BR",
};

// ─────────────────────────────────────────────
// API helper
// ─────────────────────────────────────────────
async function api<T = any>(
  path: string,
  key: string,
  opts: RequestInit = {}
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-api-key": key, ...(opts.headers ?? {}) },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

type Tab = "dashboard" | "list" | "edit" | "logs" | "users" | "config" | "backup";

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl`} style={{ background: `${color}18` }}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 mb-6 flex items-center gap-4">
      <span className="h-px w-8 bg-red-600 flex-shrink-0" />
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-red-500 transition-all text-sm";
const inp_sm = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-red-500 transition-all text-sm";

// ─────────────────────────────────────────────
// Episode Row
// ─────────────────────────────────────────────
function EpisodeRow({ ep, onUpdate, onRemove }: {
  ep: Episode;
  onUpdate: (f: keyof Episode, v: string | number) => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const parsed = ep.embedUrl ? parseIframe(ep.embedUrl) : null;
  const provider = ep.embedUrl ? detectProvider(ep.embedUrl) : "";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-black/30 border border-white/5 rounded-2xl p-4 hover:border-red-500/20 transition-all"
    >
      <div className="flex gap-3 items-start">
        <div className="w-20 flex-shrink-0">
          <Field label="Ep #">
            <input type="number" value={ep.number} min={1}
              onChange={e => onUpdate("number", Number(e.target.value))}
              className={`${inp_sm} text-center font-black`} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Título (opcional)">
            <input value={ep.title} onChange={e => onUpdate("title", e.target.value)}
              placeholder="Ex: O Início da Jornada" className={inp_sm} />
          </Field>
        </div>
        <button onClick={onRemove}
          className="mt-6 p-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-all border border-red-500/20 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="mt-3">
        <div className="flex justify-between items-center mb-1">
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Iframe / URL</label>
          {provider && <span className="text-[9px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase">{provider}</span>}
        </div>
        <textarea value={ep.embedUrl} onChange={e => onUpdate("embedUrl", e.target.value)} rows={2}
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-red-500 outline-none transition-all font-mono text-xs resize-none"
          placeholder="<iframe> ou URL direta..." />
      </div>

      <div className="mt-2 flex justify-between items-center">
        <input value={ep.embedCredit || ""} onChange={e => onUpdate("embedCredit", e.target.value)}
          placeholder="Créditos..."
          className="bg-transparent text-xs text-gray-500 outline-none border-b border-transparent focus:border-red-500 w-40 transition-all" />
        {parsed?.src && (
          <button onClick={() => setPreview(!preview)}
            className={`text-xs font-black uppercase tracking-tight px-3 py-1 rounded-lg transition-all ${preview ? "bg-red-600 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
            {preview ? "Fechar" : "Preview"}
          </button>
        )}
      </div>

      <AnimatePresence>
        {preview && parsed?.src && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 overflow-hidden">
            <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
              <iframe src={parsed.src} title="Preview" className="w-full h-full" allowFullScreen />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function AdminPage() {
  const { animes, loading: animesLoading, refetch } = useAnimes();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("adminKey") || "");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editing, setEditing] = useState<Anime>(BLANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Dashboard
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [backupStatus, setBackupStatus] = useState<any>(null);

  // Logs
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState("todos");
  const [logsLoading, setLogsLoading] = useState(false);

  // Users
  const [userStats, setUserStats] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [userData, setUserData] = useState<any>(null);

  // PageConfig
  const [cfg, setCfg] = useState<any>(null);
  const [cfgLoading, setCfgLoading] = useState(false);

  useEffect(() => { document.title = "Admin — AnimeVerse"; }, []);

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // ── Dashboard data ─────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const [db, bk] = await Promise.all([
        api("/api/db/status", apiKey),
        api("/api/git/status", apiKey),
      ]);
      setDbStatus(db);
      setBackupStatus(bk);
    } catch {}
  }, [apiKey]);

  useEffect(() => {
    if (tab === "dashboard") loadDashboard();
    if (tab === "logs") loadLogs();
    if (tab === "users") loadUsers();
    if (tab === "config") loadConfig();
    if (tab === "backup") loadDashboard();
  }, [tab]);

  // ── Logs ──────────────────────────────────────────────────────────────────
  const loadLogs = useCallback(async (kind = logFilter) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (kind !== "todos") params.set("kind", kind);
      const data = await api(`/api/logs?${params}`, apiKey);
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); }
    setLogsLoading(false);
  }, [apiKey, logFilter]);

  const clearLogs = async () => {
    try {
      await api("/api/logs", apiKey, { method: "DELETE" });
      setLogs([]);
      flash("ok", "Logs apagados!");
    } catch { flash("err", "Erro ao limpar logs."); }
  };

  // ── Users ──────────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    try {
      const data = await api("/api/user/stats", apiKey);
      setUserStats(data);
    } catch { setUserStats(null); }
  }, [apiKey]);

  const loadUserDetail = async (uid: string) => {
    setSelectedUser(uid);
    setUserData(null);
    try {
      const data = await api(`/api/user/${uid}/all`, apiKey);
      setUserData(data);
    } catch { setUserData({}); }
  };

  // ── PageConfig ─────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setCfgLoading(true);
    try {
      const data = await api("/api/pageconfig", apiKey);
      setCfg(data);
    } catch {}
    setCfgLoading(false);
  }, [apiKey]);

  const saveConfig = async () => {
    try {
      await api("/api/pageconfig", apiKey, { method: "PUT", body: JSON.stringify(cfg) });
      flash("ok", "Configurações salvas!");
    } catch { flash("err", "Erro ao salvar config."); }
  };

  // ── Backup ─────────────────────────────────────────────────────────────────
  const [backingUp, setBackingUp] = useState(false);
  const runBackup = async () => {
    setBackingUp(true);
    try {
      const r = await api("/api/git/backup", apiKey, {
        method: "POST",
        body: JSON.stringify({ message: `[admin] manual — ${new Date().toLocaleString("pt-BR")}` }),
      });
      flash("ok", r.result || "Backup concluído!");
      loadDashboard();
    } catch (e: any) { flash("err", e.message || "Erro no backup"); }
    setBackingUp(false);
  };

  // ── Anime CRUD ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!editing.id || !editing.title) return flash("err", "ID e Título são obrigatórios.");
    setSaving(true);
    try {
      await api("/api/animes", apiKey, { method: "POST", body: JSON.stringify(editing) });
      flash("ok", `"${editing.title}" salvo no MongoDB!`);
      localStorage.setItem("adminKey", apiKey);
      await refetch();
      setTab("list");
    } catch (e: any) { flash("err", e.message || "Erro ao salvar."); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api(`/api/animes/${id}`, apiKey, { method: "DELETE" });
      flash("ok", "Anime removido!");
      await refetch();
    } catch { flash("err", "Erro ao remover."); }
    setConfirmDel(null);
  };

  const openEdit = (a: Anime) => { setEditing({ ...a }); setTab("edit"); window.scrollTo(0, 0); };
  const openNew = () => { setEditing({ ...BLANK }); setTab("edit"); };

  const addEp = () => setEditing(e => ({
    ...e,
    episodes: [...e.episodes, { id: `ep${Date.now()}`, number: e.episodes.length + 1, title: "", embedUrl: "", embedCredit: "" }]
  }));
  const updEp = (i: number, f: keyof Episode, v: string | number) =>
    setEditing(e => { const eps = [...e.episodes]; eps[i] = { ...eps[i], [f]: v }; return { ...e, episodes: eps }; });
  const remEp = (i: number) => setEditing(e => ({ ...e, episodes: e.episodes.filter((_, j) => j !== i) }));

  const filteredAnimes = animes.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase())
  );

  // ─────────────────────────────────────────────
  // Tabs config
  // ─────────────────────────────────────────────
  const TABS: { id: Tab; icon: string; label: string }[] = [
    { id: "dashboard", icon: "⚡", label: "Dashboard" },
    { id: "list",      icon: "🎬", label: "Catálogo" },
    { id: "logs",      icon: "📜", label: "Logs" },
    { id: "users",     icon: "👥", label: "Usuários" },
    { id: "config",    icon: "⚙️", label: "Config" },
    { id: "backup",    icon: "☁️", label: "Backup" },
  ];

  const logKinds = ["todos", "add", "update", "delete", "git", "error"];
  const logColors: Record<string, string> = { add: "#22c55e", update: "#60a5fa", delete: "#ef4444", git: "#a78bfa", error: "#ef4444" };

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-20">
      {/* Ambient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 right-0 w-[60%] h-[50%] bg-red-600/4 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[40%] h-[40%] bg-red-900/4 blur-[100px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter flex items-center gap-3">
              <span className="bg-red-600 text-white px-2.5 py-0.5 rounded-lg text-xl shadow-[0_0_20px_rgba(220,38,38,0.4)]">
                ADM
              </span>
              AnimeVerse Console
            </h1>
            <p className="text-gray-600 text-xs mt-1 font-mono uppercase tracking-widest">
              MongoDB Atlas ·{" "}
              <span className={dbStatus?.state === "ready" ? "text-green-500" : "text-yellow-500"}>
                {dbStatus?.state ?? "conectando..."}
              </span>
            </p>
          </div>

          {/* API Key */}
          <div className="relative group w-fit">
            <div className="absolute -inset-1 bg-red-600/20 rounded-xl blur group-focus-within:bg-red-600/30 transition-all" />
            <div className="relative flex items-center gap-3 bg-black/60 border border-white/10 rounded-xl px-4 py-2.5">
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              <input
                type="password" value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onBlur={() => apiKey && localStorage.setItem("adminKey", apiKey)}
                placeholder="API Key"
                className="bg-transparent outline-none text-xs font-mono w-36 text-white placeholder:text-gray-600"
              />
            </div>
          </div>
        </header>

        {/* ── Toast ───────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {msg && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl text-sm font-black uppercase tracking-widest flex items-center gap-3
                ${msg.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
            >
              {msg.type === "ok" ? "✓" : "⚠"} {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Nav Tabs ────────────────────────────────────────────────────── */}
        <nav className="flex gap-1 mb-8 bg-white/[0.03] p-1.5 rounded-2xl border border-white/5 w-full overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all
                ${tab === t.id ? "bg-red-600 text-white shadow-lg shadow-red-600/20" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TAB: DASHBOARD                                                  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <AnimatePresence mode="wait">
          {tab === "dashboard" && (
            <motion.div key="dash" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon="🎬" label="Animes" value={animes.length} color="#ef4444" />
                <StatCard icon="🗄️" label="MongoDB" value={dbStatus?.state ?? "—"} color={dbStatus?.state === "ready" ? "#22c55e" : "#f59e0b"} />
                <StatCard icon="📜" label="Logs" value={logs.length || "—"} color="#60a5fa" />
                <StatCard icon="☁️" label="Backups" value={backupStatus?.backupCount ?? "—"} color="#a78bfa" />
              </div>

              {/* MongoDB + Backup info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                  <SectionHeader>🗄️ MongoDB Status</SectionHeader>
                  {dbStatus ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase font-bold">Estado</span>
                        <span className={`text-xs font-black uppercase px-3 py-1 rounded-full
                          ${dbStatus.state === "ready" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                          {dbStatus.state}
                        </span>
                      </div>
                      {dbStatus.latencyMs && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 uppercase font-bold">Latência</span>
                          <span className="text-xs font-black text-white">{dbStatus.latencyMs}ms</span>
                        </div>
                      )}
                      {dbStatus.error && (
                        <p className="text-xs text-red-400 font-mono bg-red-500/10 rounded-lg p-3">{dbStatus.error}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 animate-pulse">Verificando conexão...</p>
                  )}
                </div>

                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                  <SectionHeader>☁️ GitHub Backup</SectionHeader>
                  {backupStatus ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase font-bold">Último backup</span>
                        <span className="text-xs font-black text-white">{backupStatus.lastMsg || "Nenhum ainda"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase font-bold">Total backups</span>
                        <span className="text-xs font-black text-white">{backupStatus.backupCount ?? 0}</span>
                      </div>
                      {backupStatus.nextAuto && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500 uppercase font-bold">Próximo auto</span>
                          <span className="text-xs font-mono text-gray-400">
                            {new Date(backupStatus.nextAuto).toLocaleTimeString("pt-BR")}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600 animate-pulse">Carregando...</p>
                  )}
                  <button onClick={runBackup} disabled={backingUp}
                    className="mt-4 w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50">
                    {backingUp ? "Fazendo backup..." : "⚡ Backup Agora"}
                  </button>
                </div>
              </div>

              {/* Quick actions */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                <SectionHeader>⚡ Ações Rápidas</SectionHeader>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: "➕ Novo Anime", action: () => { openNew(); setTab("edit"); } },
                    { label: "📜 Ver Logs", action: () => setTab("logs") },
                    { label: "👥 Usuários", action: () => setTab("users") },
                    { label: "⚙️ PageConfig", action: () => setTab("config") },
                  ].map(({ label, action }) => (
                    <button key={label} onClick={action}
                      className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: CATÁLOGO                                                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {tab === "list" && (
            <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black uppercase tracking-tighter">Catálogo</h2>
                  <span className="bg-red-600/20 text-red-400 text-xs font-black px-3 py-1 rounded-full border border-red-600/20">
                    {animes.length} títulos
                  </span>
                </div>
                <div className="flex gap-3">
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar..."
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-red-500 transition-all w-48" />
                  <button onClick={openNew}
                    className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                    Novo
                  </button>
                </div>
              </div>

              {animesLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-pulse">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-white/5 rounded-2xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {filteredAnimes.map(a => (
                    <div key={a.id}
                      className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl flex items-center gap-4 hover:bg-white/[0.05] hover:border-white/10 transition-all group">
                      <img src={a.cover} alt="" className="w-14 h-20 object-cover rounded-xl border border-white/10 flex-shrink-0"
                        onError={e => e.currentTarget.src = "https://placehold.co/56x80/111/444?text=?"}/>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-white truncate text-base uppercase tracking-tight">{a.title}</h3>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-bold uppercase tracking-widest">
                          <span className="text-red-400">{a.year}</span>
                          <span className="text-gray-700">·</span>
                          <span className="text-gray-500">{a.episodeCount} eps</span>
                          <span className="text-gray-700">·</span>
                          <span className="text-yellow-500">★ {a.rating}</span>
                        </div>
                        <p className="text-[10px] text-gray-600 font-mono mt-1 truncate">{a.id}</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(a)}
                          className="p-2 bg-white/5 hover:bg-white/15 rounded-xl transition-all border border-white/5">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button onClick={() => setConfirmDel(a.id)}
                          className="p-2 bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white rounded-xl transition-all border border-red-500/10">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: EDITOR                                                     */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {tab === "edit" && (
            <motion.div key="edit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 pb-32">

              {/* Primárias */}
              <section className="bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl">
                <SectionHeader>Informações Primárias</SectionHeader>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-1">
                    <Field label="ID / Slug">
                      <div className="flex gap-2">
                        <input value={editing.id} onChange={e => setEditing(x => ({ ...x, id: e.target.value }))}
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm outline-none focus:border-red-500 transition-all" />
                        <button onClick={() => editing.title && setEditing(x => ({ ...x, id: slugify(x.title) }))}
                          title="Gerar do título"
                          className="px-3 bg-white/5 hover:bg-white/10 rounded-xl text-lg transition-all border border-white/5">🚀</button>
                      </div>
                    </Field>
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Título Principal">
                      <input value={editing.title} onChange={e => setEditing(x => ({ ...x, title: e.target.value }))} className={inp} />
                    </Field>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Títulos Alternativos (separar por vírgula)">
                      <input
                        value={(editing.alt_titles || []).join(", ")}
                        onChange={e => setEditing(x => ({ ...x, alt_titles: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                        className={inp} />
                    </Field>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Sinopse">
                      <textarea value={editing.synopsis} onChange={e => setEditing(x => ({ ...x, synopsis: e.target.value }))}
                        rows={3} className={`${inp} resize-none`} />
                    </Field>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5">
                  <Field label="Ano">
                    <input type="number" value={editing.year}
                      onChange={e => setEditing(x => ({ ...x, year: Number(e.target.value) }))}
                      className={`${inp} text-center`} />
                  </Field>
                  <Field label="Nota ★">
                    <input type="number" step="0.1" min="0" max="10" value={editing.rating}
                      onChange={e => setEditing(x => ({ ...x, rating: Number(e.target.value) }))}
                      className={`${inp} text-center`} />
                  </Field>
                  <Field label="Total Eps">
                    <input type="number" value={editing.episodeCount}
                      onChange={e => setEditing(x => ({ ...x, episodeCount: Number(e.target.value) }))}
                      className={`${inp} text-center`} />
                  </Field>
                  <Field label="Áudio">
                    <select value={editing.audioType}
                      onChange={e => setEditing(x => ({ ...x, audioType: e.target.value as any }))}
                      className={`${inp} appearance-none`}>
                      <option value="dublado">🎙 Dublado</option>
                      <option value="legendado">💬 Legendado</option>
                      <option value="dual-audio">🎧 Dual</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={editing.status}
                      onChange={e => setEditing(x => ({ ...x, status: e.target.value as any }))}
                      className={`${inp} appearance-none`}>
                      <option value="em-andamento">🟢 Lançando</option>
                      <option value="completo">🔵 Completo</option>
                      <option value="pausado">🟡 Pausado</option>
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <Field label="Gêneros (vírgula)">
                    <input
                      value={(editing.genres || []).join(", ")}
                      onChange={e => setEditing(x => ({ ...x, genres: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                      className={inp} />
                  </Field>
                  <Field label="Tags (vírgula)">
                    <input
                      value={(editing.tags || []).join(", ")}
                      onChange={e => setEditing(x => ({ ...x, tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                      className={inp} />
                  </Field>
                </div>
              </section>

              {/* Mídia */}
              <section className="bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl">
                <SectionHeader>Mídia e Arte</SectionHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <Field label="Capa URL (Poster)">
                      <input value={editing.cover} onChange={e => setEditing(x => ({ ...x, cover: e.target.value }))} className={`${inp} font-mono text-xs`} />
                    </Field>
                    <Field label="Banner URL (Background)">
                      <input value={editing.banner || ""} onChange={e => setEditing(x => ({ ...x, banner: e.target.value }))} className={`${inp} font-mono text-xs`} />
                    </Field>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-24 h-32 bg-black/60 rounded-xl border border-white/10 overflow-hidden flex-shrink-0">
                      <img src={editing.cover} className="w-full h-full object-cover" alt="cover" onError={e => e.currentTarget.style.display = "none"} />
                    </div>
                    <div className="flex-1 h-32 bg-black/60 rounded-xl border border-white/10 overflow-hidden">
                      <img src={editing.banner || editing.cover} className="w-full h-full object-cover" alt="banner" onError={e => e.currentTarget.style.display = "none"} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Episódios */}
              <section className="bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl">
                <div className="flex items-center justify-between mb-6">
                  <SectionHeader>Lista de Episódios ({editing.episodes.length})</SectionHeader>
                  <button onClick={addEp}
                    className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    + Adicionar
                  </button>
                </div>
                <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                  <AnimatePresence>
                    {editing.episodes.map((ep, i) => (
                      <EpisodeRow key={ep.id || i} ep={ep} onUpdate={(f, v) => updEp(i, f, v)} onRemove={() => remEp(i)} />
                    ))}
                  </AnimatePresence>
                  {editing.episodes.length === 0 && (
                    <div className="text-center py-12 text-gray-600">
                      <p className="text-4xl mb-3">🎬</p>
                      <p className="text-sm font-bold">Nenhum episódio ainda</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Sticky save bar */}
              <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-8 sm:max-w-lg ml-auto flex gap-3 bg-black/90 backdrop-blur-xl p-3 rounded-3xl border border-white/10 shadow-2xl z-50">
                <button onClick={() => setTab("list")}
                  className="flex-1 sm:flex-none sm:px-6 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all text-xs">
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-[2] bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all text-xs shadow-[0_0_24px_rgba(220,38,38,0.3)] disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Salvando...
                    </>
                  ) : "💾 Salvar no MongoDB"}
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: LOGS                                                       */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {tab === "logs" && (
            <motion.div key="logs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-wrap gap-1">
                  {logKinds.map(k => (
                    <button key={k} onClick={() => { setLogFilter(k); loadLogs(k); }}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
                        ${logFilter === k ? "bg-red-600 border-red-600 text-white" : "bg-white/5 border-white/5 text-gray-500 hover:text-white"}`}>
                      {k}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => loadLogs(logFilter)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 text-white rounded-xl text-xs font-black uppercase transition-all">↻ Atualizar</button>
                  <button onClick={clearLogs}
                    className="px-4 py-2 bg-red-600/10 hover:bg-red-600 border border-red-500/20 text-red-400 hover:text-white rounded-xl text-xs font-black uppercase transition-all">
                    🗑 Limpar
                  </button>
                </div>
              </div>

              {logsLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-20 text-gray-600">
                  <p className="text-5xl mb-3">📭</p>
                  <p className="font-bold">Nenhum log encontrado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, i) => {
                    const color = logColors[log.kind] ?? "#6b7280";
                    return (
                      <div key={i} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex gap-4 items-start hover:bg-white/[0.04] transition-all">
                        <div className="w-1 flex-shrink-0 rounded-full self-stretch" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-white truncate">{log.title}</p>
                            <span className="text-[10px] font-mono text-gray-600 flex-shrink-0">{log.ts?.slice(0, 19)}</span>
                          </div>
                          {log.detail && <p className="text-xs text-gray-500 mt-1 font-mono line-clamp-2">{log.detail}</p>}
                        </div>
                        <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg flex-shrink-0"
                          style={{ background: `${color}18`, color }}>
                          {log.kind}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: USUÁRIOS                                                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {tab === "users" && (
            <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {!userStats ? (
                <div className="text-center py-20 text-gray-600 animate-pulse">
                  <p className="text-5xl mb-3">👥</p>
                  <p className="font-bold">Carregando usuários...</p>
                </div>
              ) : (
                <>
                  {/* Stats header */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard icon="👥" label="Usuários" value={userStats.totalUsers ?? 0} color="#60a5fa" />
                    <StatCard icon="📺" label="Watchlists" value={userStats.users?.reduce((a: number, u: any) => a + (u.collections?.watchlist ?? 0), 0) ?? 0} color="#22c55e" />
                    <StatCard icon="✅" label="Assistidos" value={userStats.users?.reduce((a: number, u: any) => a + (u.collections?.watched ?? 0), 0) ?? 0} color="#f59e0b" />
                    <StatCard icon="🔔" label="Inscrições" value={userStats.users?.reduce((a: number, u: any) => a + (u.collections?.subscriptions ?? 0), 0) ?? 0} color="#a78bfa" />
                  </div>

                  {/* User list */}
                  <div className="space-y-3">
                    {(userStats.users ?? []).map((u: any) => (
                      <div key={u.userId}
                        className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.04] transition-all">
                        <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center text-red-400 font-black text-sm flex-shrink-0">
                          {u.userId.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-gray-400 truncate">{u.userId}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {Object.entries(u.collections ?? {}).map(([col, count]) => (
                              <span key={col}
                                className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                                {col}: {String(count)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-gray-600 font-mono">{u.lastModified?.slice(0, 10)}</p>
                          <button onClick={() => loadUserDetail(u.userId)}
                            className="mt-2 px-3 py-1 bg-white/5 hover:bg-white/10 text-xs font-black text-gray-400 hover:text-white rounded-lg transition-all border border-white/5">
                            Ver dados
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* User detail modal */}
              <AnimatePresence>
                {selectedUser && (
                  <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-[#0a0a0a] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
                    >
                      <div className="flex items-center justify-between p-5 border-b border-white/5">
                        <div>
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Dados do Usuário</p>
                          <p className="font-mono text-xs text-white mt-1">{selectedUser}</p>
                        </div>
                        <button onClick={() => { setSelectedUser(null); setUserData(null); }}
                          className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400">✕</button>
                      </div>
                      <div className="overflow-y-auto flex-1 p-5">
                        {!userData ? (
                          <p className="text-gray-500 animate-pulse text-sm">Carregando...</p>
                        ) : Object.keys(userData).length === 0 ? (
                          <p className="text-gray-600 text-sm">Sem dados encontrados.</p>
                        ) : (
                          <div className="space-y-4">
                            {Object.entries(userData).map(([col, data]) => (
                              <div key={col}>
                                <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2">{col}</p>
                                <pre className="bg-black/60 border border-white/5 rounded-xl p-4 text-xs text-gray-400 font-mono overflow-x-auto max-h-48">
                                  {JSON.stringify(data, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: PAGECONFIG                                                 */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {tab === "config" && (
            <motion.div key="config" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {cfgLoading || !cfg ? (
                <div className="text-center py-20 text-gray-600 animate-pulse">
                  <p className="text-5xl mb-3">⚙️</p>
                  <p className="font-bold">Carregando configurações...</p>
                </div>
              ) : (
                <div className="space-y-6">

                  {/* Hero */}
                  <section className="bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl">
                    <SectionHeader>🎬 Hero & Destaque</SectionHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label="Anime em Destaque (ID)">
                        <input value={cfg.featuredAnimeId ?? ""} onChange={e => setCfg((c: any) => ({ ...c, featuredAnimeId: e.target.value }))} className={inp} placeholder="ex: jujutsu-kaisen" />
                      </Field>
                      <Field label="Badge do Hero">
                        <input value={cfg.heroBadgeText ?? ""} onChange={e => setCfg((c: any) => ({ ...c, heroBadgeText: e.target.value }))} className={inp} />
                      </Field>
                      <Field label="Texto do Botão CTA">
                        <input value={cfg.heroCtaText ?? ""} onChange={e => setCfg((c: any) => ({ ...c, heroCtaText: e.target.value }))} className={inp} />
                      </Field>
                      <Field label="Título do Catálogo">
                        <input value={cfg.catalogTitle ?? ""} onChange={e => setCfg((c: any) => ({ ...c, catalogTitle: e.target.value }))} className={inp} />
                      </Field>
                      <Field label="Título do Site">
                        <input value={cfg.siteTitle ?? ""} onChange={e => setCfg((c: any) => ({ ...c, siteTitle: e.target.value }))} className={`${inp} md:col-span-2`} />
                      </Field>
                    </div>
                    <div className="flex gap-6 mt-5">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div
                          onClick={() => setCfg((c: any) => ({ ...c, showRandomButton: !c.showRandomButton }))}
                          className={`w-10 h-6 rounded-full transition-colors relative ${cfg.showRandomButton ? "bg-red-600" : "bg-white/10"}`}>
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${cfg.showRandomButton ? "left-5" : "left-1"}`} />
                        </div>
                        <span className="text-xs font-bold text-gray-400">Botão Aleatório</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div
                          onClick={() => setCfg((c: any) => ({ ...c, featuredBannerBlur: !c.featuredBannerBlur }))}
                          className={`w-10 h-6 rounded-full transition-colors relative ${cfg.featuredBannerBlur ? "bg-red-600" : "bg-white/10"}`}>
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${cfg.featuredBannerBlur ? "left-5" : "left-1"}`} />
                        </div>
                        <span className="text-xs font-bold text-gray-400">Blur no Banner</span>
                      </label>
                    </div>
                  </section>

                  {/* Anúncio */}
                  <section className="bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl">
                    <SectionHeader>📢 Banner de Anúncio</SectionHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="flex items-center gap-3">
                        <div
                          onClick={() => setCfg((c: any) => ({ ...c, announcement: { ...(c.announcement ?? {}), enabled: !c.announcement?.enabled } }))}
                          className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${cfg.announcement?.enabled ? "bg-red-600" : "bg-white/10"}`}>
                          <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${cfg.announcement?.enabled ? "left-5" : "left-1"}`} />
                        </div>
                        <span className="text-xs font-bold text-gray-400">Ativo</span>
                      </div>
                      <Field label="Tipo">
                        <select value={cfg.announcement?.type ?? "info"}
                          onChange={e => setCfg((c: any) => ({ ...c, announcement: { ...(c.announcement ?? {}), type: e.target.value } }))}
                          className={`${inp} appearance-none`}>
                          <option value="info">ℹ️ Info</option>
                          <option value="warning">⚠️ Aviso</option>
                          <option value="success">✅ Sucesso</option>
                        </select>
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Texto do Anúncio">
                          <textarea value={cfg.announcement?.text ?? ""}
                            onChange={e => setCfg((c: any) => ({ ...c, announcement: { ...(c.announcement ?? {}), text: e.target.value } }))}
                            rows={2} className={`${inp} resize-none`} />
                        </Field>
                      </div>
                    </div>
                  </section>

                  {/* Gêneros fixados */}
                  <section className="bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl">
                    <SectionHeader>📌 Gêneros Fixados</SectionHeader>
                    <Field label="Gêneros (vírgula) — aparecem primeiro nos filtros">
                      <input
                        value={(cfg.pinnedGenres ?? []).join(", ")}
                        onChange={e => setCfg((c: any) => ({ ...c, pinnedGenres: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))}
                        className={inp} placeholder="Ação, Romance, Fantasia..." />
                    </Field>
                  </section>

                  {/* Save */}
                  <button onClick={saveConfig}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_24px_rgba(220,38,38,0.25)]">
                    💾 Salvar Configurações
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: BACKUP                                                     */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {tab === "backup" && (
            <motion.div key="backup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-2xl mx-auto space-y-6">

              <div className="bg-white/[0.02] border border-white/5 p-8 rounded-3xl">
                <SectionHeader>☁️ GitHub Backup</SectionHeader>

                {backupStatus && (
                  <div className="bg-black/30 rounded-2xl p-5 mb-6 space-y-3 border border-white/5">
                    {[
                      ["Último backup", backupStatus.lastMsg || "Nenhum ainda"],
                      ["Total realizados", backupStatus.backupCount ?? 0],
                      ["Status", backupStatus.pending ? "⏳ Pendente" : "✅ Sincronizado"],
                      ["Próximo auto", backupStatus.nextAuto ? new Date(backupStatus.nextAuto).toLocaleString("pt-BR") : "—"],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase">{l}</span>
                        <span className="text-xs font-black text-white">{String(v)}</span>
                      </div>
                    ))}
                    {backupStatus.error && (
                      <div className="mt-3 bg-red-600/10 border border-red-500/20 rounded-xl p-3">
                        <p className="text-xs text-red-400 font-mono">{backupStatus.error}</p>
                      </div>
                    )}
                  </div>
                )}

                <button onClick={runBackup} disabled={backingUp}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_24px_rgba(220,38,38,0.25)] flex items-center justify-center gap-3">
                  {backingUp ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Fazendo backup...
                    </>
                  ) : "⚡ Backup Agora → GitHub"}
                </button>
                <p className="text-[10px] text-gray-600 text-center mt-3">
                  O servidor exporta MongoDB → JSON → git commit → push no branch <code className="text-gray-500">data</code>
                </p>
              </div>

              <div className="bg-white/[0.02] border border-white/5 p-8 rounded-3xl">
                <SectionHeader>📥 Restore do GitHub</SectionHeader>
                <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                  Restaura os animes do <code className="text-gray-400">output.json</code> no branch <code className="text-gray-400">data</code> para o MongoDB.
                  Útil para inicializar o banco após deploy.
                </p>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-5">
                  <p className="text-xs text-yellow-400 font-bold">⚠️ Atenção: esta operação sobrescreve os dados atuais no MongoDB com os dados do GitHub.</p>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm("Restaurar dados do GitHub → MongoDB?")) return;
                    try {
                      const remote = await fetch("https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/output.json");
                      const data = await remote.json();
                      const list = Array.isArray(data) ? data : Object.values(data);
                      let ok = 0;
                      for (const a of list as any[]) {
                        try { await api("/api/animes", apiKey, { method: "POST", body: JSON.stringify(a) }); ok++; } catch {}
                      }
                      flash("ok", `${ok}/${list.length} animes restaurados!`);
                      await refetch();
                    } catch (e: any) { flash("err", e.message); }
                  }}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-widest rounded-2xl transition-all text-sm">
                  ⬇️ Restaurar do GitHub
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Confirm Delete Modal ─────────────────────────────────────────── */}
        <AnimatePresence>
          {confirmDel && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                className="bg-[#0a0a0a] border border-red-500/20 p-10 rounded-[2.5rem] max-w-sm w-full text-center"
              >
                <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-5 border border-red-600/30">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-2">Remover anime?</h3>
                <p className="text-gray-500 text-sm mb-2">
                  <span className="text-white font-bold font-mono">{confirmDel}</span> será removido do MongoDB.
                </p>
                <p className="text-gray-600 text-xs mb-8">O backup automático (10min) preservará o histórico no GitHub.</p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDel(null)}
                    className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete(confirmDel!)}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-red-600/20">
                    Confirmar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}