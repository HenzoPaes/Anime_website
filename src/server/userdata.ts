// src/server/userData.ts
// Gerencia dados de usuário (watchlist, histórico, episódios assistidos, etc.)
// Cada usuário tem uma pasta userData/<userId>/ com arquivos JSON por coleção.
// Após cada escrita, agenda um sync com o GitHub via gitSync.scheduleUserDataSync().

import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { scheduleUserDataSync } from "./gitsync";

export const USER_DATA_DIR = path.join(process.cwd(), "userData");

// ── Coleções permitidas (whitelist de segurança) ──────────────────────────────
const ALLOWED_COLLECTIONS = new Set([
  "watchlist",    // Record<string, WatchlistEntry>
  "watched",      // Record<string, string[]>       animeId → epId[]
  "history",      // HistoryEntry[]
  "subscriptions",// string[]                       animeIds inscritos
  "ep-counts",    // Record<string, number>          animeId → contagem
]);

// ── Validação ─────────────────────────────────────────────────────────────────
function isValidUserId(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
}

function isValidCollection(col: string): boolean {
  return ALLOWED_COLLECTIONS.has(col);
}

// ── I/O ───────────────────────────────────────────────────────────────────────
function userDir(userId: string): string {
  const dir = path.join(USER_DATA_DIR, userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readUserData<T>(userId: string, collection: string): T | null {
  const file = path.join(userDir(userId), `${collection}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeUserData<T>(userId: string, collection: string, data: T): void {
  const file = path.join(userDir(userId), `${collection}.json`);
  const tmp  = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data), "utf-8");
  fs.renameSync(tmp, file);

  // Agenda sync com GitHub (debounced 8s)
  scheduleUserDataSync(`${collection} — user ${userId.slice(0, 8)}`);
}

// ── Stats (para o admin GUI) ──────────────────────────────────────────────────
export function getUserStats(): { totalUsers: number; users: { id: string; collections: string[]; lastModified: string }[] } {
  if (!fs.existsSync(USER_DATA_DIR)) return { totalUsers: 0, users: [] };
  const dirs  = fs.readdirSync(USER_DATA_DIR, { withFileTypes: true })
                  .filter(d => d.isDirectory());
  const users = dirs.map(d => {
    const userId = d.name;
    const dir    = path.join(USER_DATA_DIR, userId);
    const files  = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    const mtime  = files.reduce((latest, f) => {
      const t = fs.statSync(path.join(dir, f)).mtime;
      return t > latest ? t : latest;
    }, new Date(0));
    return {
      id:           userId,
      collections:  files.map(f => f.replace(".json", "")),
      lastModified: mtime.toISOString(),
    };
  });
  return { totalUsers: users.length, users };
}

// ── Express Router ─────────────────────────────────────────────────────────────
export function createUserRouter(): Router {
  const router = Router();

  // GET /api/user/stats  (admin — sem auth por ora, dados são anônimos)
  router.get("/stats", (_req: Request, res: Response) => {
    res.json(getUserStats());
  });

  // GET /api/user/:userId/:collection
  router.get("/:userId/:collection", (req: Request, res: Response) => {
    const { userId, collection } = req.params;
    if (!isValidUserId(userId))
      return res.status(400).json({ error: "userId inválido" });
    if (!isValidCollection(collection))
      return res.status(400).json({ error: `Coleção '${collection}' não permitida` });

    const data = readUserData(userId, collection);
    if (data === null) return res.status(404).json({ error: "Nenhum dado encontrado" });
    res.json(data);
  });

  // PUT /api/user/:userId/:collection
  router.put("/:userId/:collection", (req: Request, res: Response) => {
    const { userId, collection } = req.params;
    if (!isValidUserId(userId))
      return res.status(400).json({ error: "userId inválido" });
    if (!isValidCollection(collection))
      return res.status(400).json({ error: `Coleção '${collection}' não permitida` });

    try {
      writeUserData(userId, collection, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/user/:userId/:collection
  router.delete("/:userId/:collection", (req: Request, res: Response) => {
    const { userId, collection } = req.params;
    if (!isValidUserId(userId) || !isValidCollection(collection))
      return res.status(400).json({ error: "Params inválidos" });

    const file = path.join(userDir(userId), `${collection}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      scheduleUserDataSync(`delete ${collection} — user ${userId.slice(0, 8)}`);
    }
    res.json({ success: true });
  });

  return router;
}