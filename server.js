import "dotenv/config";
import express from "express";
import ViteExpress from "vite-express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || "dev-key";
const ANIMES_FILE = path.join(__dirname, "animes.json");
const BACKUP_DIR = path.join(__dirname, "backups");

// Ensure backup dir exists
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(express.json({ limit: "10mb" }));

// ── Helpers ────────────────────────────────────────────────────────────────
function readAnimes() {
  try {
    return JSON.parse(fs.readFileSync(ANIMES_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeAnimes(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `backup_${ts}.json`);
  if (fs.existsSync(ANIMES_FILE)) fs.copyFileSync(ANIMES_FILE, backupPath);
  const tmp = ANIMES_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, ANIMES_FILE);
  return backupPath;
}

function auth(req, res, next) {
  if (req.headers["x-api-key"] !== API_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ── Public API ─────────────────────────────────────────────────────────────
app.get("/api/animes", (_req, res) => res.json(readAnimes()));

app.get("/api/animes/:id", (req, res) => {
  const anime = readAnimes().find((a) => a.id === req.params.id);
  if (!anime) return res.status(404).json({ error: "Not found" });
  res.json(anime);
});

// ── Protected API ──────────────────────────────────────────────────────────
app.post("/api/animes", auth, (req, res) => {
  const anime = req.body;
  if (!anime?.id || !anime?.title)
    return res.status(400).json({ error: "id and title are required" });
  let list = readAnimes();
  const idx = list.findIndex((a) => a.id === anime.id);
  if (idx >= 0) list[idx] = anime;
  else list.push(anime);
  const backup = writeAnimes(list);
  res.json({ success: true, message: "Salvo com sucesso!", backup, anime });
});

app.delete("/api/animes/:id", auth, (req, res) => {
  let list = readAnimes();
  const before = list.length;
  list = list.filter((a) => a.id !== req.params.id);
  if (list.length === before) return res.status(404).json({ error: "Not found" });
  const backup = writeAnimes(list);
  res.json({ success: true, message: "Removido!", backup });
});

app.get("/api/backups", auth, (_req, res) => {
  const files = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).reverse()
    : [];
  res.json(files);
});

app.post("/api/backups/:name/restore", auth, (req, res) => {
  const name = path.basename(req.params.name);
  const src = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(src)) return res.status(404).json({ error: "Backup not found" });
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  const backup = writeAnimes(data);
  res.json({ success: true, message: `Restaurado: ${name}`, backup });
});

// ── Vite-Express handles the React app (dev HMR + production static) ───────
ViteExpress.listen(app, PORT, () => {
  console.log(`\n🚀  AnimeVerse rodando em http://localhost:${PORT}`);
  console.log(`📦  API disponível em http://localhost:${PORT}/api/animes`);
  console.log(`🔑  API_KEY: ${API_KEY === "dev-key" ? "dev-key (padrão, mude no .env!)" : "✓ definida"}\n`);
});
