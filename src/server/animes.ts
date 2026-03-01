// src/server/animes.ts
import fs from "fs";
import path from "path";
import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
import { getDb, mongoStatus } from "./db";
import { createUserRouter } from "./userdata";
import { createGitRouter, scheduleBackup } from "./gitsync";

// ── Config ────────────────────────────────────────────────────────────────────
const API_KEY    = process.env.API_KEY ?? "9f3a7c1d8e4b2a6f0c9e5d3b7a1f8c2e";
const REMOTE_URL = "https://raw.githubusercontent.com/HenzoPaes/Anime_website/refs/heads/data/output.json";
const BACKUP_DIR = path.join(process.cwd(), "backups");

interface Anime { id: string; title: string; [key: string]: any; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function strip_id(doc: any): Anime {
  const { _id, _updatedAt, _seededAt, ...rest } = doc;
  return rest as Anime;
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ── READ ALL ──────────────────────────────────────────────────────────────────
export async function readAllAnimes(): Promise<Anime[]> {
  const db = await getDb();

  if (db) {
    const docs = await db.collection("animes").find({}).toArray();
    if (docs.length > 0) return docs.map(strip_id);

    // Mongo vazio — faz seed pelo GitHub
    console.log("📦 Mongo vazio. Seed pelo GitHub...");
    const remote = await _fetchGitHub();
    if (remote?.length) { await _seedMongo(db, remote); return remote; }
    return [];
  }

  // Fallback: GitHub raw
  return (await _fetchGitHub()) ?? [];
}

// ── READ ONE ──────────────────────────────────────────────────────────────────
export async function readAnime(id: string): Promise<Anime | null> {
  const db = await getDb();
  if (db) {
    const doc = await db.collection("animes").findOne({ id });
    return doc ? strip_id(doc) : null;
  }
  return (await readAllAnimes()).find(a => String(a.id) === id) ?? null;
}

// ── WRITE (upsert) ────────────────────────────────────────────────────────────
export async function writeAnime(anime: Anime): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.collection("animes").updateOne(
      { id: anime.id },
      { $set: { ...anime, _updatedAt: new Date() } },
      { upsert: true },
    );
  } else {
    // Fallback local
    ensureBackupDir();
    fs.writeFileSync(
      path.join(BACKUP_DIR, `${anime.id}.json`),
      JSON.stringify(anime, null, 2), "utf-8",
    );
  }
  scheduleBackup(`anime: ${anime.title}`);
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function removeAnime(id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const r = await db.collection("animes").deleteOne({ id });
  if (r.deletedCount > 0) { scheduleBackup(`anime deleted: ${id}`); return true; }
  return false;
}

// ── PAGECONFIG ────────────────────────────────────────────────────────────────
export async function readPageConfig(): Promise<any> {
  const db = await getDb();
  if (db) {
    const doc = await db.collection("pageconfig").findOne({ _key: "main" });
    if (doc) { const { _id, _key, ...cfg } = doc; return cfg; }
  }
  try { return JSON.parse(fs.readFileSync("pageconfig.json", "utf-8")); }
  catch { return {}; }
}

export async function writePageConfig(cfg: any): Promise<void> {
  const db = await getDb();
  const data = { ...cfg, lastUpdated: new Date().toISOString().slice(0, 10), _key: "main" };
  if (db) {
    await db.collection("pageconfig").updateOne(
      { _key: "main" }, { $set: data }, { upsert: true },
    );
  } else {
    fs.writeFileSync("pageconfig.json", JSON.stringify(cfg, null, 2), "utf-8");
  }
  scheduleBackup("pageconfig");
}

// ── LOGS ──────────────────────────────────────────────────────────────────────
export async function writeLog(entry: {
  kind: string; title: string; detail?: string; level?: string;
}): Promise<void> {
  const db = await getDb();
  const doc = { ...entry, ts: new Date(), level: entry.level ?? "info" };
  if (db) {
    await db.collection("logs").insertOne(doc);
    // Mantém só 2000 logs
    const count = await db.collection("logs").countDocuments();
    if (count > 2000) {
      const oldest = await db.collection("logs")
        .find().sort({ ts: 1 }).limit(count - 2000).toArray();
      await db.collection("logs").deleteMany({ _id: { $in: oldest.map(d => d._id) } });
    }
  } else {
    const LOG_FILE = "anime_admin_log.json";
    let logs: any[] = [];
    try { logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")); } catch {}
    logs.push({ ...doc, ts: doc.ts.toISOString() });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs.slice(-2000), null, 2), "utf-8");
  }
}

export async function readLogs(limit = 200, kind?: string): Promise<any[]> {
  const db = await getDb();
  if (db) {
    const filter = kind && kind !== "todos" ? { kind } : {};
    const docs = await db.collection("logs")
      .find(filter).sort({ ts: -1 }).limit(limit).toArray();
    return docs.map(({ _id, ...r }) => ({
      ...r,
      ts: r.ts instanceof Date ? r.ts.toISOString().replace("T"," ").slice(0,19) : r.ts,
    }));
  }
  try {
    let logs = JSON.parse(fs.readFileSync("anime_admin_log.json", "utf-8")) as any[];
    if (kind && kind !== "todos") logs = logs.filter(l => l.kind === kind);
    return logs.reverse().slice(0, limit);
  } catch { return []; }
}

// ── DUMP (para backup) ────────────────────────────────────────────────────────
export async function dumpAllForBackup(): Promise<{
  animes: Anime[];
  pageconfig: any;
  userData: Array<{ userId: string; collection: string; data: any }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("MongoDB indisponível para backup");

  const [animeDocs, pcDoc, userDocs] = await Promise.all([
    db.collection("animes").find({}).toArray(),
    db.collection("pageconfig").findOne({ _key: "main" }),
    db.collection("userData").find({}).toArray(),
  ]);

  const pageconfig = pcDoc ? (({ _id, _key, ...c }) => c)(pcDoc) : {};
  return {
    animes:     animeDocs.map(strip_id),
    pageconfig,
    userData:   userDocs.map(({ _id, ...r }) => r as any),
  };
}

// ── Private ───────────────────────────────────────────────────────────────────
async function _fetchGitHub(): Promise<Anime[] | null> {
  try {
    const r = await axios.get(REMOTE_URL, { timeout: 6000 });
    if (Array.isArray(r.data))      return r.data;
    if (typeof r.data === "object") return Object.values(r.data);
    return null;
  } catch (e: any) {
    console.warn(`⚠️ GitHub raw falhou: ${e.message}`);
    return null;
  }
}

async function _seedMongo(db: any, animes: Anime[]) {
  const ops = animes.map(a => ({
    updateOne: {
      filter: { id: a.id },
      update: { $setOnInsert: { ...a, _seededAt: new Date() } },
      upsert: true,
    },
  }));
  await db.collection("animes").bulkWrite(ops, { ordered: false });
  console.log(`🌱 Seed: ${animes.length} animes → MongoDB`);
}

// ── Express Server ─────────────────────────────────────────────────────────────
export async function startServer() {
  const app  = express();
  const PORT = process.env.PORT ?? 8080;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  const auth = (req: any, res: any, next: any) => {
    if (req.headers["x-api-key"] !== API_KEY)
      return res.status(401).json({ error: "Unauthorized" });
    next();
  };

  // ── Animes ────────────────────────────────────────────────────────────────
  app.get("/api/animes",     async (_req, res) => res.json(await readAllAnimes()));
  app.get("/api/animes/:id", async (req, res) => {
    const a = await readAnime(req.params.id);
    return a ? res.json(a) : res.status(404).json({ error: "Não encontrado" });
  });
  app.post("/api/animes", auth, async (req, res) => {
    const a = req.body;
    if (!a?.id || !a?.title) return res.status(400).json({ error: "id e title obrigatórios" });
    await writeAnime(a);
    await writeLog({ kind: "add", title: `Salvo: ${a.title}` });
    res.json({ success: true });
  });
  app.delete("/api/animes/:id", auth, async (req, res) => {
    const ok = await removeAnime(req.params.id);
    return ok ? res.json({ success: true }) : res.status(404).json({ error: "Não encontrado" });
  });

  // ── PageConfig ─────────────────────────────────────────────────────────────
  app.get("/api/pageconfig",  async (_req, res) => res.json(await readPageConfig()));
  app.put("/api/pageconfig", auth, async (req, res) => {
    await writePageConfig(req.body);
    res.json({ success: true });
  });

  // ── Logs ───────────────────────────────────────────────────────────────────
  app.get("/api/logs", auth, async (req, res) => {
    res.json(await readLogs(parseInt(req.query.limit as string) || 200, req.query.kind as string));
  });
  app.delete("/api/logs", auth, async (_req, res) => {
    const db = await getDb();
    if (db) await db.collection("logs").deleteMany({});
    res.json({ success: true });
  });

  // ── DB Status ──────────────────────────────────────────────────────────────
  app.get("/api/db/status", auth, (_req, res) => res.json(mongoStatus));

  // ── User Data ──────────────────────────────────────────────────────────────
  app.use("/api/user", createUserRouter());

  // ── Git/Backup ─────────────────────────────────────────────────────────────
  app.use("/api/git", auth, createGitRouter());

  // ── Frontend Static ────────────────────────────────────────────────────────
  const distPath = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ── Startup ────────────────────────────────────────────────────────────────
  app.listen(PORT, async () => {
    console.log(`\n🚀 AnimeVerse Server — porta ${PORT}`);
    console.log(`🔑 API_KEY: ${API_KEY === "dev-key" ? "⚠️  PADRÃO (altere no .env)" : "✅ Ok"}`);
    await getDb(); // inicia conexão Mongo em background
    console.log(`🗄️  MongoDB: ${mongoStatus.state}${mongoStatus.error ? ` — ${mongoStatus.error}` : ""}`);
    if (mongoStatus.state !== "ready") {
      console.log("📥 Sem Mongo — animes virão do GitHub raw ao primeiro request.");
    }
    console.log("✅ Pronto!\n");
  });
}

startServer();