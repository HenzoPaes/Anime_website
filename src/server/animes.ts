// src/server/animes.ts
import fs from "fs";
import path from "path";
import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
import { createUserRouter } from "./userdata";
import { gitPull, createGitRouter, scheduleUserDataSync } from "./gitsync";

// Configurações
const ANIMES_DIR  = path.join(process.cwd(), "Api", "Animes");
const BACKUP_DIR  = path.join(process.cwd(), "backups");
const API_KEY     = process.env.API_KEY || "dev-key";
const REMOTE_URL  = "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/output.json";

interface Anime {
  id: string | number;
  title: string;
  [key: string]: any;
}

export function ensureDirs() {
  if (!fs.existsSync(ANIMES_DIR)) fs.mkdirSync(ANIMES_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  // userData dir é criado sob demanda pelo userData.ts
}

async function fetchRemoteAnimes(): Promise<Anime[] | null> {
  try {
    console.log("🌐 Tentando buscar dados remotos do GitHub...");
    const response = await axios.get(REMOTE_URL, { timeout: 5000 });
    if (Array.isArray(response.data)) {
      console.log(`✅ ${response.data.length} animes carregados do GitHub.`);
      return response.data;
    }
    if (typeof response.data === "object") return Object.values(response.data);
    return null;
  } catch (e: any) {
    console.warn(`⚠️ Falha ao buscar GitHub: ${e.message}. Usando arquivos locais.`);
    return null;
  }
}

export async function readAllAnimes(): Promise<Anime[]> {
  const remoteData = await fetchRemoteAnimes();
  if (remoteData) return remoteData;

  try {
    if (!fs.existsSync(ANIMES_DIR)) return [];
    const files = fs.readdirSync(ANIMES_DIR).filter(f => f.endsWith(".json"));
    const localAnimes = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(ANIMES_DIR, f), "utf-8")); }
      catch  { return null; }
    }).filter(Boolean) as Anime[];
    console.log(`📂 ${localAnimes.length} animes carregados localmente.`);
    return localAnimes;
  } catch (e: any) {
    console.error("❌ Erro crítico ao ler pasta local:", e.message);
    return [];
  }
}

export async function readAnime(id: string): Promise<Anime | null> {
  const all   = await readAllAnimes();
  const found = all.find(a => String(a.id) === String(id));
  if (found) return found;
  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
    catch { return null; }
  }
  return null;
}

export function writeAnime(anime: Anime) {
  const id  = anime.id;
  const p   = path.join(ANIMES_DIR, `${id}.json`);
  if (fs.existsSync(p)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(p, path.join(BACKUP_DIR, `backup_${id}_${ts}.json`));
  }
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(anime, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

export function removeAnime(id: string): boolean {
  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return false;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(p, path.join(BACKUP_DIR, `backup_${id}_${ts}.json`));
  fs.unlinkSync(p);
  return true;
}

export function fetchBackupsSync(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json")).reverse();
}

export function restoreBackup(name: string) {
  const src = path.join(BACKUP_DIR, path.basename(name));
  if (!fs.existsSync(src)) throw new Error("Backup não encontrado");
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  writeAnime(data);
  return data;
}

// ── Servidor API ──────────────────────────────────────────────────────────────

export async function startServer() {
  ensureDirs();
  const app  = express();
  const PORT = process.env.PORT || 8080;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // ── Auth middleware (rotas de admin) ─────────────────────────────────────────
  const auth = (req: any, res: any, next: any) => {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  // ── Rotas de Animes ──────────────────────────────────────────────────────────
  app.get("/api/animes", async (_req, res) => {
    const data = await readAllAnimes();
    res.json(data);
  });

  app.get("/api/animes/:id", async (req, res) => {
    const anime = await readAnime(req.params.id);
    if (!anime) return res.status(404).json({ error: "Anime não encontrado" });
    res.json(anime);
  });

  app.post("/api/animes", auth, (req, res) => {
    const anime = req.body;
    if (!anime?.id || !anime?.title)
      return res.status(400).json({ error: "id e title são obrigatórios" });
    writeAnime(anime);
    // Agenda sync dos arquivos de anime tbm
    scheduleUserDataSync(`anime saved: ${anime.title}`);
    res.json({ success: true, message: "Salvo com sucesso!", anime });
  });

  app.delete("/api/animes/:id", auth, (req, res) => {
    const ok = removeAnime(req.params.id);
    if (!ok) return res.status(404).json({ error: "Arquivo local não encontrado" });
    res.json({ success: true, message: "Removido localmente. Backup criado." });
  });

  // ── Rotas de Backups ──────────────────────────────────────────────────────────
  app.get("/api/backups", auth, (_req, res) => {
    res.json(fetchBackupsSync());
  });

  app.post("/api/backups/:name/restore", auth, (req, res) => {
    try {
      const data = restoreBackup(req.params.name);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // ── Rotas de Dados do Usuário ─────────────────────────────────────────────────
  // Sem auth — o UUID age como token. Dados ficam em userData/<uuid>/
  app.use("/api/user", createUserRouter());

  // ── Rotas Git (status/push/pull via API) ─────────────────────────────────────
  // Auth obrigatório para operações git via API
  app.use("/api/git", auth, createGitRouter());

  // ── Frontend Static ───────────────────────────────────────────────────────────
  const distPath = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  }

  // ── Startup: puxa userData mais recente do GitHub ─────────────────────────────
  app.listen(PORT, async () => {
    console.log(`
🚀 Servidor Rodando em Porta: ${PORT}
📂 Animes Locais: ${ANIMES_DIR}
👤 User Data:     userData/
🔗 GitHub:        ${REMOTE_URL}
🔑 API_KEY: ${API_KEY === "dev-key" ? "⚠️ PADRÃO — Mude no .env!" : "✅ Protegida"}
    `);

    // Pull do GitHub em background para pegar userData atualizado
    console.log("📥 Sincronizando userData do GitHub...");
    await gitPull();
    console.log("✅ Servidor pronto!");
  });
}

startServer();