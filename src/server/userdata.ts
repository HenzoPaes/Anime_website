// src/server/userData.ts
// Dados de usuário (watchlist, histórico, watched, subscriptions, ep-counts)
// Primário: MongoDB coleção "userData" — documentos { userId, collection, data, updatedAt }
// Fallback: diretório userData/<userId>/<collection>.json (somente leitura)
// Backup: disparado automaticamente pelo gitSync após cada escrita

import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { getDb } from "./db";
import { scheduleBackup } from "./gitsync";

// ── Constantes ────────────────────────────────────────────────────────────────
export const USER_DATA_DIR = path.join(process.cwd(), "userData");

const ALLOWED = new Set([
  "watchlist",
  "watched",
  "history",
  "subscriptions",
  "ep-counts",
]);

// ── Validação ─────────────────────────────────────────────────────────────────
function isValidUUID(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function readUserData<T>(userId: string, collection: string): Promise<T | null> {
  const db = await getDb();

  if (db) {
    const doc = await db.collection("userData").findOne({ userId, collection });
    return doc ? (doc.data as T) : null;
  }

  // Fallback: arquivo local
  const file = path.join(USER_DATA_DIR, userId, `${collection}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; }
  catch { return null; }
}

export async function writeUserData<T>(
  userId: string,
  collection: string,
  data: T,
): Promise<void> {
  const db = await getDb();

  if (db) {
    await db.collection("userData").updateOne(
      { userId, collection },
      { $set: { userId, collection, data, updatedAt: new Date() } },
      { upsert: true },
    );
  } else {
    // Fallback local
    const dir = path.join(USER_DATA_DIR, userId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${collection}.json`);
    const tmp  = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data), "utf-8");
    fs.renameSync(tmp, file);
  }

  // Agenda backup GitHub (debounced)
  scheduleBackup(`userData ${collection} — ${userId.slice(0, 8)}`);
}

export async function deleteUserData(userId: string, collection: string): Promise<void> {
  const db = await getDb();
  if (db) {
    await db.collection("userData").deleteOne({ userId, collection });
  } else {
    const file = path.join(USER_DATA_DIR, userId, `${collection}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  scheduleBackup(`userData delete ${collection}`);
}

// ── Stats (para o admin GUI) ──────────────────────────────────────────────────
export async function getUserStats(): Promise<{
  totalUsers: number;
  users: Array<{
    userId: string;
    collections: Record<string, number>;
    lastModified: string;
  }>;
}> {
  const db = await getDb();
  if (db) {
    const docs = await db.collection("userData").find({}).toArray();

    // Agrupa por userId
    const map = new Map<string, { collections: Record<string, number>; lastMod: Date }>();
    for (const doc of docs) {
      const uid = doc.userId as string;
      const col = doc.collection as string;
      const count = Array.isArray(doc.data)
        ? doc.data.length
        : typeof doc.data === "object" && doc.data !== null
          ? Object.keys(doc.data).length
          : 1;
      const existing = map.get(uid) ?? { collections: {}, lastMod: new Date(0) };
      existing.collections[col] = count;
      if (doc.updatedAt > existing.lastMod) existing.lastMod = doc.updatedAt;
      map.set(uid, existing);
    }

    const users = Array.from(map.entries())
      .map(([userId, { collections, lastMod }]) => ({
        userId,
        collections,
        lastModified: lastMod.toISOString(),
      }))
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified));

    return { totalUsers: users.length, users };
  }

  // Fallback: lê arquivos locais
  if (!fs.existsSync(USER_DATA_DIR)) return { totalUsers: 0, users: [] };
  const dirs = fs.readdirSync(USER_DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());
  const users = dirs.map(d => {
    const uid   = d.name;
    const dir   = path.join(USER_DATA_DIR, uid);
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    const collections: Record<string, number> = {};
    let lastMod = new Date(0);
    for (const f of files) {
      const fp = path.join(dir, f);
      try {
        const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
        collections[f.replace(".json", "")] = Array.isArray(data) ? data.length : Object.keys(data).length;
        const t = fs.statSync(fp).mtime;
        if (t > lastMod) lastMod = t;
      } catch {}
    }
    return { userId: uid, collections, lastModified: lastMod.toISOString() };
  });
  return { totalUsers: users.length, users };
}

/** Retorna todos os dados de um usuário (para o admin visualizar) */
export async function getUserAllData(userId: string): Promise<Record<string, any>> {
  const db = await getDb();
  if (db) {
    const docs = await db.collection("userData").find({ userId }).toArray();
    return Object.fromEntries(docs.map(d => [d.collection, d.data]));
  }
  const dir = path.join(USER_DATA_DIR, userId);
  if (!fs.existsSync(dir)) return {};
  const result: Record<string, any> = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    try { result[f.replace(".json", "")] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")); }
    catch {}
  }
  return result;
}

// ── Express Router ────────────────────────────────────────────────────────────
export function createUserRouter(): Router {
  const router = Router();

  // GET /api/user/stats  (admin)
  router.get("/stats", async (_req: Request, res: Response) => {
    res.json(await getUserStats());
  });

  // GET /api/user/:userId/all  (admin — todos os dados de um usuário)
  router.get("/:userId/all", async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.userId))
      return res.status(400).json({ error: "userId inválido" });
    res.json(await getUserAllData(req.params.userId));
  });

  // GET /api/user/:userId/:collection
  router.get("/:userId/:collection", async (req: Request, res: Response) => {
    const { userId, collection } = req.params;
    if (!isValidUUID(userId))      return res.status(400).json({ error: "userId inválido" });
    if (!ALLOWED.has(collection))  return res.status(400).json({ error: "Coleção não permitida" });

    const data = await readUserData(userId, collection);
    if (data === null) return res.status(404).json({ error: "Sem dados" });
    res.json(data);
  });

  // PUT /api/user/:userId/:collection
  router.put("/:userId/:collection", async (req: Request, res: Response) => {
    const { userId, collection } = req.params;
    if (!isValidUUID(userId))      return res.status(400).json({ error: "userId inválido" });
    if (!ALLOWED.has(collection))  return res.status(400).json({ error: "Coleção não permitida" });

    try {
      await writeUserData(userId, collection, req.body);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/user/:userId/:collection
  router.delete("/:userId/:collection", async (req: Request, res: Response) => {
    const { userId, collection } = req.params;
    if (!isValidUUID(userId) || !ALLOWED.has(collection))
      return res.status(400).json({ error: "Params inválidos" });

    await deleteUserData(userId, collection);
    res.json({ success: true });
  });

  return router;
}