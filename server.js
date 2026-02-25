// server.js — lê da pasta Animes/, um .json por anime
import "dotenv/config";
import express from "express";
import ViteExpress from "vite-express";
import path from "path";
import { fileURLToPath } from "url";
import {
  ensureDirs,
  readAllAnimes,
  readAnime,
  writeAnime,
  removeAnime,
  checkAuth,
  fetchBackupsSync,
  restoreBackup,
  config,
} from "./src/server/animes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);

console.log("DIR ATUAL:", __dirname);
console.log("ANIMES_DIR:", config.ANIMES_DIR);

ensureDirs();
console.log("Existe pasta?", true);
console.log("Arquivos:", (await readAllAnimes()).length, "carregados");

app.use(express.json({ limit: "20mb" }));

function auth(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  // Verifica se existe e se é válida
  if (!apiKey || !checkAuth(apiKey)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

// ── Rotas públicas ─────────────────────────────────────────────────────────
app.get("/api/animes", async (_req, res) => {
  const data = await readAllAnimes();
  res.json(data);
});

app.get("/api/animes/:id", async (req, res) => {
  const anime = await readAnime(req.params.id);
  if (!anime) return res.status(404).json({ error: "Not found" });
  res.json(anime);
});

// ── Rotas protegidas ───────────────────────────────────────────────────────
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
    // Em JS puro, só acessa err.message
    res.status(404).json({ error: err.message });
  }
});

// ── Vite-Express: cuida do React em dev e prod ─────────────────────────────
ViteExpress.listen(app, PORT, () => {
  console.log(`\n🚀  AnimeVerse em http://localhost:${PORT}`);
  console.log(`📁  Animes carregados de: ${config.ANIMES_DIR}`);
  console.log(
    `    (coloque seus JSONs lá, ex: Animes/boku-no-hero.json)`
  );
  console.log(
    `🔑  API_KEY: ${
      config.API_KEY === "dev-key"
        ? "dev-key (mude no .env!)"
        : "✓ definida"
    }\n`
  );
});
