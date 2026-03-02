// src/server/animes.ts
import fs from "fs";
import path from "path";
import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";

// ── Configuração ─────────────────────────────────────────────
const ANIMES_DIR    = path.join(process.cwd(), "Api", "Animes");
const API_KEY       = process.env.API_KEY || "dev-key";

const GITHUB_OWNER  = process.env.GITHUB_OWNER || "HenzoPaes";
const GITHUB_REPO   = process.env.GITHUB_REPO  || "Anime_website";
const GITHUB_BRANCH = "data";
const GITHUB_FILE   = "output.json";

const REMOTE_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/${GITHUB_BRANCH}/${GITHUB_FILE}`;

// ── Tipagem ──────────────────────────────────────────────────
interface Anime {
  id: string | number;
  title: string;
  [key: string]: any;
}

// ── Cache ────────────────────────────────────────────────────
let _remoteCache: Anime[] | null = null;
let _cacheTTL = 0;
const CACHE_MS = 60_000; // 1 min

// ── Buscar do GitHub (apenas leitura) ────────────────────────
async function fetchRemoteAnimes(): Promise<Anime[] | null> {
  const now = Date.now();

  if (_remoteCache && now < _cacheTTL) {
    console.log("⚡ Cache hit");
    return _remoteCache;
  }

  try {
    console.log("🌐 Buscando do GitHub...");
    const res  = await axios.get(REMOTE_URL, { timeout: 8000 });
    const data = Array.isArray(res.data)
      ? res.data
      : Object.values(res.data as object);

    _remoteCache = data as Anime[];
    _cacheTTL = now + CACHE_MS;

    console.log(`✅ ${_remoteCache.length} animes carregados`);
    return _remoteCache;
  } catch (e: any) {
    console.warn("⚠️ GitHub inacessível, usando local");
    return null;
  }
}

// ── Fallback local ───────────────────────────────────────────
async function readLocalAnimes(): Promise<Anime[]> {
  if (!fs.existsSync(ANIMES_DIR)) return [];

  const files = fs.readdirSync(ANIMES_DIR)
    .filter(f => f.endsWith(".json"));

  return files.map(f => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(ANIMES_DIR, f), "utf-8")
      );
    } catch {
      return null;
    }
  }).filter(Boolean) as Anime[];
}

// ── Leitura principal ────────────────────────────────────────
export async function readAllAnimes(): Promise<Anime[]> {
  const remote = await fetchRemoteAnimes();
  if (remote) return remote;
  return await readLocalAnimes();
}

export async function readAnime(id: string): Promise<Anime | null> {
  const all = await readAllAnimes();
  return all.find(a => String(a.id) === String(id)) ?? null;
}

// ── Servidor ─────────────────────────────────────────────────
export async function startServer() {
  const app  = express();
  const PORT = process.env.PORT || 8080;

  app.use(cors());
  app.use(express.json());

  const auth = (req: any, res: any, next: any) => {
    if (req.headers["x-api-key"] !== API_KEY)
      return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  // GET todos
  app.get("/api/animes", async (_req, res) => {
    const data = await readAllAnimes();
    res.json(data);
  });

  // GET por id
  app.get("/api/animes/:id", async (req, res) => {
    const anime = await readAnime(req.params.id);
    if (!anime)
      return res.status(404).json({ error: "Anime não encontrado" });
    res.json(anime);
  });

  // Bloqueia qualquer escrita
  app.all("/api/*", (req, res, next) => {
    if (req.method !== "GET")
      return res.status(405).json({ error: "Servidor em modo somente leitura" });
    next();
  });

  app.listen(PORT, () => {
    console.log(`
🚀 Servidor na porta: ${PORT}
📖 MODO: SOMENTE LEITURA
🐙 GitHub: ${GITHUB_OWNER}/${GITHUB_REPO} → ${GITHUB_BRANCH}/${GITHUB_FILE}
    `);
  });
}

startServer();