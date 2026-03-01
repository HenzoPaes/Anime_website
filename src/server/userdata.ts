// src/server/userData.ts
// Gerencia dados de usuário (watchlist, histórico, episódios assistidos, etc.)
// Cada usuário tem uma pasta userData/<userId>/ com arquivos JSON por coleção.

import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";

const USER_DATA_DIR = path.join(process.cwd(), "userData");

// ── Coleções permitidas (whitelist de segurança) ──────────────────────────────
const ALLOWED_COLLECTIONS = new Set([
  "watchlist",      // Record<string, WatchlistEntry>
  "watched",        // Record<string, string[]>      animeId → epId[]
  "history",        // HistoryEntry[]
  "subscriptions",  // string[]                      animeIds inscritos
  "ep-counts",      // Record<string, number>         animeId → contagem
]);

// ── Validação ──────────────────────────────────────────────────────────────────
function isValidUserId(id: string): boolean {
  // UUID v4 simples: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
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
}

// ── Express Router ─────────────────────────────────────────────────────────────
export function createUserRouter(): Router {
  const router = Router();

  // GET /api/user/:userId/:collection
  router.get("/:userId/:collection", (req: Request, res: Response) => {
    const { userId, collection } = req.params;

    if (!isValidUserId(userId)) {
      return res.status(400).json({ error: "userId inválido" });
    }
    if (!isValidCollection(collection)) {
      return res.status(400).json({ error: `Coleção '${collection}' não permitida` });
    }

    const data = readUserData(userId, collection);
    if (data === null) return res.status(404).json({ error: "Nenhum dado encontrado" });
    res.json(data);
  });

  // PUT /api/user/:userId/:collection
  router.put("/:userId/:collection", (req: Request, res: Response) => {
    const { userId, collection } = req.params;

    if (!isValidUserId(userId)) {
      return res.status(400).json({ error: "userId inválido" });
    }
    if (!isValidCollection(collection)) {
      return res.status(400).json({ error: `Coleção '${collection}' não permitida` });
    }

    try {
      writeUserData(userId, collection, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/user/:userId/:collection  (limpar tudo de uma coleção)
  router.delete("/:userId/:collection", (req: Request, res: Response) => {
    const { userId, collection } = req.params;

    if (!isValidUserId(userId) || !isValidCollection(collection)) {
      return res.status(400).json({ error: "Params inválidos" });
    }

    const file = path.join(userDir(userId), `${collection}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ success: true });
  });

  return router;
}