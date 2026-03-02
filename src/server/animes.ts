// src/server/animes.ts
import fs from "fs";
import path from "path";
import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";

// ── Configuração ─────────────────────────────────────────────────────────────
const ANIMES_DIR    = path.join(process.cwd(), "Api", "Animes");
const BACKUP_DIR    = path.join(process.cwd(), "backups");
const API_KEY       = process.env.API_KEY      || "dev-key";
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || "";         // Personal Access Token
const GITHUB_OWNER  = process.env.GITHUB_OWNER || "HenzoPaes";
const GITHUB_REPO   = process.env.GITHUB_REPO  || "Anime_website";
const GITHUB_BRANCH = "data";
const GITHUB_FILE   = "output.json";

// By default this file runs in READ_ONLY mode (no writes, no pushes).
// To allow writes set READ_ONLY=false in your .env (and configure GITHUB_TOKEN).
const READ_ONLY = "true";

const REMOTE_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/${GITHUB_FILE}`;
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

// ── Tipagem ───────────────────────────────────────────────────────────────────
interface Anime {
  id: string | number;
  title: string;
  [key: string]: any;
}

// ── Dirs ─────────────────────────────────────────────────────────────────────
export function ensureDirs() {
  if (!fs.existsSync(ANIMES_DIR)) fs.mkdirSync(ANIMES_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── Cache em memória (evita fetch desnecessário) ──────────────────────────────
let _remoteCache: Anime[] | null = null;
let _cacheTTL = 0;
const CACHE_MS = 60_000; // 1 min

// ── GitHub READ ───────────────────────────────────────────────────────────────
async function fetchRemoteAnimes(): Promise<Anime[] | null> {
  const now = Date.now();
  if (_remoteCache && now < _cacheTTL) {
    console.log("⚡ Cache hit — usando dados em memória.");
    return _remoteCache;
  }
  try {
    console.log("🌐 Buscando dados remotos do GitHub...");
    const res  = await axios.get(REMOTE_URL, { timeout: 8000 });
    const data = Array.isArray(res.data) ? res.data : Object.values(res.data as object);
    _remoteCache = data as Anime[];
    _cacheTTL    = now + CACHE_MS;
    console.log(`✅ ${_remoteCache.length} animes carregados do GitHub.`);
    return _remoteCache;
  } catch (e: any) {
    console.warn(`⚠️  GitHub inacessível: ${e.message}. Usando arquivos locais.`);
    return null;
  }
}

// ── GitHub WRITE (NO-OP em READ_ONLY) ────────────────────────────────────────

/** Pega o SHA atual do arquivo no GitHub (necessário para update via API). */
async function getFileSha(): Promise<string | null> {
  if (READ_ONLY) return null;
  try {
    const res = await axios.get(GITHUB_API, {
      params:  { ref: GITHUB_BRANCH },
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      timeout: 8000,
    });
    return res.data.sha ?? null;
  } catch {
    return null;
  }
}

/**
 * Faz push de um array de animes para a branch "data" do GitHub.
 * Substitui o arquivo output.json inteiro.
 *
 * Em READ_ONLY: não faz nada (retorna false).
 */
export async function pushAnimesToGitHub(
  animes: Anime[],
  message = "chore: update animes data"
): Promise<boolean> {
  if (READ_ONLY) {
    console.log("⛔ READ_ONLY ativo — push para GitHub ignorado.");
    return false;
  }
  if (!GITHUB_TOKEN) {
    console.warn("⚠️  GITHUB_TOKEN não configurado. Push ignorado.");
    return false;
  }
  try {
    const sha     = await getFileSha();
    const content = Buffer.from(JSON.stringify(animes, null, 2), "utf-8").toString("base64");

    await axios.put(
      GITHUB_API,
      {
        message,
        content,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
        timeout: 15_000,
      }
    );

    // Invalida cache após push
    _remoteCache = null;
    _cacheTTL    = 0;
    console.log(`✅ Push para GitHub: ${message}`);
    return true;
  } catch (e: any) {
    console.error("❌ Falha no push para GitHub:", e.response?.data ?? e.message);
    return false;
  }
}

// ── Ler todos os animes (Remoto → Local) ──────────────────────────────────────
export async function readAllAnimes(): Promise<Anime[]> {
  const remote = await fetchRemoteAnimes();
  if (remote) return remote;

  try {
    if (!fs.existsSync(ANIMES_DIR)) return [];
    const files = fs.readdirSync(ANIMES_DIR).filter(f => f.endsWith(".json"));
    const local = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(ANIMES_DIR, f), "utf-8")); }
      catch { return null; }
    }).filter(Boolean) as Anime[];
    console.log(`📂 ${local.length} animes carregados localmente (fallback).`);
    return local;
  } catch (e: any) {
    console.error("❌ Erro crítico ao ler pasta local:", e.message);
    return [];
  }
}

/** Busca um anime específico por ID. */
export async function readAnime(id: string): Promise<Anime | null> {
  const all = await readAllAnimes();
  return all.find(a => String(a.id) === String(id)) ?? null;
}

/**
 * Salva anime localmente + sincroniza com GitHub.
 * Em READ_ONLY lança erro para evitar escrita.
 */
export async function writeAnime(anime: Anime): Promise<void> {
  if (READ_ONLY) throw new Error("Write operation disabled: server running in READ_ONLY mode.");

  const id = anime.id;
  const p  = path.join(ANIMES_DIR, `${id}.json`);

  if (fs.existsSync(p)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(p, path.join(BACKUP_DIR, `backup_${id}_${ts}.json`));
  }
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(anime, null, 2), "utf-8");
  fs.renameSync(tmp, p);

  // Sincroniza com GitHub
  const all = await readAllAnimes();
  const idx = all.findIndex(a => String(a.id) === String(id));
  if (idx >= 0) all[idx] = anime;
  else          all.push(anime);
  await pushAnimesToGitHub(all, `feat: upsert anime "${anime.title}"`);
}

/**
 * Remove anime local + sincroniza com GitHub.
 * Em READ_ONLY lança erro.
 */
export async function removeAnime(id: string): Promise<boolean> {
  if (READ_ONLY) throw new Error("Delete operation disabled: server running in READ_ONLY mode.");

  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (fs.existsSync(p)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(p, path.join(BACKUP_DIR, `backup_${id}_${ts}.json`));
    fs.unlinkSync(p);
  }

  const all = await readAllAnimes();
  const filtered = all.filter(a => String(a.id) !== String(id));
  if (filtered.length === all.length) return false;
  await pushAnimesToGitHub(filtered, `feat: remove anime id "${id}"`);
  return true;
}

// ── Backups ───────────────────────────────────────────────────────────────────
export function fetchBackupsSync(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json")).reverse();
}

export async function restoreBackup(name: string) {
  if (READ_ONLY) throw new Error("Restore operation disabled: server running in READ_ONLY mode.");
  const src = path.join(BACKUP_DIR, path.basename(name));
  if (!fs.existsSync(src)) throw new Error("Backup não encontrado");
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  await writeAnime(data);
  return data;
}

// ── Servidor API ──────────────────────────────────────────────────────────────
export async function startServer() {
  ensureDirs();
  const app  = express();
  const PORT = process.env.PORT || 8080;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  const auth = (req: any, res: any, next: any) => {
    if (req.headers["x-api-key"] !== API_KEY)
      return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  // ── GET /api/animes ────── lista todos (sempre disponível)
  app.get("/api/animes", async (_req, res) => {
    const data = await readAllAnimes();
    res.json(data);
  });

  // ── GET /api/animes/:id ── um anime (sempre disponível)
  app.get("/api/animes/:id", async (req, res) => {
    const anime = await readAnime(req.params.id);
    if (!anime) return res.status(404).json({ error: "Anime não encontrado" });
    res.json(anime);
  });

  // ── Rotas de escrita: se READ_ONLY => resposta 405; caso contrário, comportam-se normalmente.
  if (READ_ONLY) {
    const methodNotAllowed = (_req: any, res: any) => res.status(405).json({ error: "Read-only mode. Writes are disabled." });

    app.post("/api/animes", methodNotAllowed);
    app.delete("/api/animes/:id", methodNotAllowed);
    app.post("/api/animes/bulk", methodNotAllowed);
    app.post("/api/github/sync", methodNotAllowed);
    app.get("/api/github/status", auth, async (_req, res) => {
      // status read-only still useful
      res.json({
        owner:     GITHUB_OWNER,
        repo:      GITHUB_REPO,
        branch:    GITHUB_BRANCH,
        file:      GITHUB_FILE,
        tokenSet:  !!GITHUB_TOKEN,
        readOnly:  true,
        cacheHit:  !!(_remoteCache && Date.now() < _cacheTTL),
        cachedAt:  _cacheTTL ? new Date(_cacheTTL - CACHE_MS).toISOString() : null,
      });
    });
    app.get("/api/backups", auth, (_req, res) => res.json(fetchBackupsSync()));
    app.post("/api/backups/:name/restore", methodNotAllowed);
  } else {
    // modo gravável — comportamento original
    app.post("/api/animes", auth, async (req, res) => {
      const anime = req.body;
      if (!anime?.id || !anime?.title)
        return res.status(400).json({ error: "id e title são obrigatórios" });
      try {
        await writeAnime(anime);
        res.json({ success: true, message: "Salvo e sincronizado com GitHub!", anime });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete("/api/animes/:id", auth, async (req, res) => {
      try {
        const ok = await removeAnime(req.params.id);
        if (!ok) return res.status(404).json({ error: "Anime não encontrado" });
        res.json({ success: true, message: "Removido e sincronizado com GitHub!" });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/animes/bulk", auth, async (req, res) => {
      const list: Anime[] = req.body;
      if (!Array.isArray(list))
        return res.status(400).json({ error: "Body deve ser um array de animes." });
      const ok = await pushAnimesToGitHub(list, `feat: bulk import (${list.length} animes)`);
      res.json({ success: ok, count: list.length });
    });

    app.post("/api/github/sync", auth, async (_req, res) => {
      _remoteCache = null;
      _cacheTTL    = 0;
      const data   = await readAllAnimes();
      res.json({ success: true, count: data.length });
    });

    app.get("/api/github/status", auth, async (_req, res) => {
      res.json({
        owner:     GITHUB_OWNER,
        repo:      GITHUB_REPO,
        branch:    GITHUB_BRANCH,
        file:      GITHUB_FILE,
        tokenSet:  !!GITHUB_TOKEN,
        cacheHit:  !!(_remoteCache && Date.now() < _cacheTTL),
        cachedAt:  _cacheTTL ? new Date(_cacheTTL - CACHE_MS).toISOString() : null,
      });
    });

    app.get("/api/backups", auth, (_req, res) => res.json(fetchBackupsSync()));

    app.post("/api/backups/:name/restore", auth, async (req, res) => {
      try {
        const data = await restoreBackup(req.params.name);
        res.json({ success: true, data });
      } catch (err: any) {
        res.status(404).json({ error: err.message });
      }
    });
  }

  // ── Frontend static ─────────────────────────────────────────────────────────
  const distPath = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api"))
        res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, () => {
    console.log(`
🚀 Servidor na porta:  ${PORT}
📂 Pasta local:        ${ANIMES_DIR}
🐙 GitHub:             ${GITHUB_OWNER}/${GITHUB_REPO} → branch ${GITHUB_BRANCH}/${GITHUB_FILE}
🔑 API_KEY:            ${API_KEY === "dev-key" ? "⚠️  PADRÃO (mude no .env!)" : "✅ Protegida"}
🔐 GITHUB_TOKEN:       ${GITHUB_TOKEN ? "✅ Configurado" : "⚠️  Não configurado (somente leitura)"}
📚 MODE:                ${READ_ONLY ? "READ_ONLY (apenas leitura)" : "READ/WRITE (escrita habilitada)"}
    `);
  });
}

startServer();