// src/server/animes.ts
import fs from "fs";
import path from "path";
import "dotenv/config";
import express from "express";
import cors from "cors";

// Apontar diretamente para a pasta usada pelas APIs estáticas
const ANIMES_DIR = path.join(process.cwd(), "Api", "Animes");
const BACKUP_DIR = path.join(process.cwd(), "backups");
const API_KEY = process.env.API_KEY || "dev-key";

// Garante que as pastas existam
export function ensureDirs() {
  if (!fs.existsSync(ANIMES_DIR)) fs.mkdirSync(ANIMES_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function readAllAnimes() {
  try {
    const local = fs
      .readdirSync(ANIMES_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(ANIMES_DIR, f), "utf-8"));
        } catch (e) {
          console.error(`Erro ao ler ${f}:`, (e as any).message);
          return null;
        }
      })
      .filter(Boolean);
    return local;
  } catch (e) {
    console.error("Erro ao listar Animes/:", (e as any).message);
    return [];
  }
}

export async function readAnime(id: string) {
  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (e) {
      console.error(`Erro ao parsear ${id}.json:`, (e as any).message);
      return null;
    }
  }
  return null;
}

export function writeAnime(anime: any) {
  const id = anime.id;
  const p = path.join(ANIMES_DIR, `${id}.json`);
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

export function checkAuth(apiKey: string): boolean {
  return apiKey === API_KEY;
}

export function fetchBackupsSync(): string[] {
  return fs.existsSync(BACKUP_DIR)
    ? fs
        .readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith(".json"))
        .reverse()
    : [];
}

export function restoreBackup(name: string) {
  const src = path.join(BACKUP_DIR, path.basename(name));
  if (!fs.existsSync(src))
    throw new Error("Backup não encontrado");
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  writeAnime(data);
  return data;
}

export const config = {
  ANIMES_DIR,
  BACKUP_DIR,
  API_KEY,
};

// ── Servidor API ─────────────────────────────────────────────────────

export async function startServer() {
  const app = express();
  // Use PORT from environment (Render sets this to 3000)
  const PORT = process.env.PORT || 8080;

  // Permite que o frontend akses a API
  app.use(cors());
  app.use(express.json({ limit: "20mb" }));

  console.log("ANIMES_DIR:", config.ANIMES_DIR);

  ensureDirs();
  const loadedAnimes = await readAllAnimes();
  console.log("Existe pasta?", fs.existsSync(config.ANIMES_DIR));
  console.log("Arquivos:", loadedAnimes.length, "carregados");

  function auth(req: any, res: any, next: any) {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || !checkAuth(apiKey)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }

  // API Routes
  app.get("/api/animes", async (_req, res) => {
    const data = await readAllAnimes();
    res.json(data);
  });

  app.get("/api/animes/:id", async (req, res) => {
    const anime = await readAnime(req.params.id);
    if (!anime) return res.status(404).json({ error: "Not found" });
    res.json(anime);
  });

  app.post("/api/animes", auth, (req, res) => {
    const anime = req.body;
    if (!anime?.id || !anime?.title)
      return res.status(400).json({ error: "id e title são obrigatórios" });
    writeAnime(anime);
    res.json({
      success: true,
      message: `${anime.title} salvo em Animes/${anime.id}.json!`,
      anime,
    });
  });

  app.delete("/api/animes/:id", auth, (req, res) => {
    const ok = removeAnime(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true, message: "Removido! Backup salvo." });
  });

  app.get("/api/backups", auth, (_req, res) => {
    const files = fetchBackupsSync();
    res.json(files);
  });

  app.post("/api/backups/:name/restore", auth, (req, res) => {
    try {
      const data = restoreBackup(req.params.name);
      res.json({ success: true, message: `Restaurado: ${req.params.name}` });
    } catch (err) {
      res.status(404).json({ error: (err as any).message });
    }
  });

  // Serve static files from dist folder (frontend)
  const distPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 API em http://localhost:${PORT}`);
    console.log(`📁 Animes carregados de: ${config.ANIMES_DIR}`);
    console.log(`🔑 API_KEY: ${config.API_KEY === "dev-key" ? "dev-key (mude no .env!)" : "✓ definida"}\n`);
  });
}

// Inicia o servidor automaticamente
startServer();
