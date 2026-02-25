// server.js — lê da pasta Animes/, um .json por anime
import "dotenv/config";
import express from "express";
import ViteExpress from "vite-express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const PORT   = Number(process.env.PORT || 3000);
const API_KEY = process.env.API_KEY || "dev-key";

// ── Pasta onde ficam os JSONs individuais de cada anime ────────────────────
const ANIMES_DIR = path.join(__dirname, "Animes");
const BACKUP_DIR = path.join(__dirname, "backups");

console.log("DIR ATUAL:", __dirname);
console.log("ANIMES_DIR:", ANIMES_DIR);
console.log("Existe pasta?", fs.existsSync(ANIMES_DIR));
console.log("Arquivos:", fs.existsSync(ANIMES_DIR) ? fs.readdirSync(ANIMES_DIR) : "nenhuma");

// Garante que as pastas existam
if (!fs.existsSync(ANIMES_DIR)) fs.mkdirSync(ANIMES_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));

// ── Helpers ────────────────────────────────────────────────────────────────
function readAllAnimes() {
  try {
    return fs
      .readdirSync(ANIMES_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(ANIMES_DIR, f), "utf-8")); }
        catch (e) { console.error(`Erro ao ler ${f}:`, e.message); return null; }
      })
      .filter(Boolean);
  } catch (e) {
    console.error("Erro ao listar Animes/:", e.message);
    return [];
  }
}

function readAnime(id) {
  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); }
  catch { return null; }
}

function writeAnime(anime) {
  const id = anime.id;
  const p  = path.join(ANIMES_DIR, `${id}.json`);
  // Backup antes de sobrescrever
  if (fs.existsSync(p)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(p, path.join(BACKUP_DIR, `backup_${id}_${ts}.json`));
  }
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(anime, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

function removeAnime(id) {
  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return false;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(p, path.join(BACKUP_DIR, `backup_${id}_${ts}.json`));
  fs.unlinkSync(p);
  return true;
}

function auth(req, res, next) {
  if (req.headers["x-api-key"] !== API_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

// ── Rotas públicas ─────────────────────────────────────────────────────────
app.get("/api/animes", (_req, res) => {
  res.json(readAllAnimes());
});

app.get("/api/animes/:id", (req, res) => {
  const anime = readAnime(req.params.id);
  if (!anime) return res.status(404).json({ error: "Not found" });
  res.json(anime);
});

// ── Rotas protegidas ───────────────────────────────────────────────────────
app.post("/api/animes", auth, (req, res) => {
  const anime = req.body;
  if (!anime?.id || !anime?.title)
    return res.status(400).json({ error: "id e title são obrigatórios" });
  writeAnime(anime);
  res.json({ success: true, message: `${anime.title} salvo em Animes/${anime.id}.json!`, anime });
});

app.delete("/api/animes/:id", auth, (req, res) => {
  const ok = removeAnime(req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ success: true, message: `Removido! Backup salvo.` });
});

app.get("/api/backups", auth, (_req, res) => {
  const files = fs.existsSync(BACKUP_DIR)
    ? fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json")).reverse()
    : [];
  res.json(files);
});

app.post("/api/backups/:name/restore", auth, (req, res) => {
  const name = path.basename(req.params.name);
  const src  = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(src)) return res.status(404).json({ error: "Backup não encontrado" });
  const data = JSON.parse(fs.readFileSync(src, "utf-8"));
  writeAnime(data);
  res.json({ success: true, message: `Restaurado: ${name}` });
});

// ── Vite-Express: cuida do React em dev e prod ─────────────────────────────
ViteExpress.listen(app, PORT, () => {
  console.log(`\n🚀  AnimeVerse em http://localhost:${PORT}`);
  console.log(`📁  Animes carregados de: ${ANIMES_DIR}`);
  console.log(`    (coloque seus JSONs lá, ex: Animes/boku-no-hero.json)`);
  console.log(`🔑  API_KEY: ${API_KEY === "dev-key" ? "dev-key (mude no .env!)" : "✓ definida"}\n`);
});
