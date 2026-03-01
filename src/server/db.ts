// src/server/db.ts
// Conexão singleton com MongoDB.
// Uso:
//   import { getDb, dbReady, mongoStatus } from "./db";
//   const db = await getDb();
//   const col = db.collection("animes");
//
// Se MONGODB_URI não estiver no .env, o servidor roda sem Mongo
// e faz fallback para GitHub raw em todas as leituras.

import { MongoClient, Db, ServerApiVersion } from "mongodb";
import "dotenv/config";

// ── Config ────────────────────────────────────────────────────────────────────
const URI      = process.env.MONGODB_URI ?? "mongodb+srv://Admin1:eF3yxI37ByawBKB3@cluster0.sj0fsqz.mongodb.net/?appName=Cluster0";
const DB_NAME  = process.env.MONGODB_DB  ?? "animeverse";

export type MongoHealth = "connecting" | "ready" | "error" | "disabled";

export const mongoStatus: { state: MongoHealth; error: string | null; latencyMs: number | null } = {
  state:     "disabled",
  error:     null,
  latencyMs: null,
};

// ── Singleton ─────────────────────────────────────────────────────────────────
let _client: MongoClient | null = null;
let _db:     Db         | null = null;
let _promise: Promise<Db | null> | null = null;

export async function getDb(): Promise<Db | null> {
  if (!URI) return null;           // Mongo não configurado → caller usa fallback
  if (_db)  return _db;
  if (_promise) return _promise;

  _promise = _connect();
  _db      = await _promise;
  _promise = null;
  return _db;
}

async function _connect(): Promise<Db | null> {
  mongoStatus.state = "connecting";
  const t0 = Date.now();
  try {
    _client = new MongoClient(URI, {
      serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true },
      connectTimeoutMS:      5_000,
      serverSelectionTimeoutMS: 5_000,
    });
    await _client.connect();
    const db = _client.db(DB_NAME);

    // Ping para confirmar conexão
    await db.command({ ping: 1 });

    mongoStatus.state     = "ready";
    mongoStatus.error     = null;
    mongoStatus.latencyMs = Date.now() - t0;
    console.log(`✅ MongoDB conectado (${mongoStatus.latencyMs}ms) — db: ${DB_NAME}`);

    // Cria índices na primeira vez
    await _ensureIndexes(db);

    return db;
  } catch (e: any) {
    mongoStatus.state = "error";
    mongoStatus.error = e.message;
    console.warn(`⚠️  MongoDB falhou: ${e.message}\n    → Fallback ativo (GitHub raw).`);
    return null;
  }
}

async function _ensureIndexes(db: Db) {
  try {
    // Animes: busca por id (slug)
    await db.collection("animes").createIndex({ id: 1 }, { unique: true });
    // UserData: busca composta userId + collection
    await db.collection("userData").createIndex({ userId: 1, collection: 1 }, { unique: true });
    // Logs: ordenação por data
    await db.collection("logs").createIndex({ ts: -1 });
  } catch {
    // índices já existem — ok
  }
}

/** Fecha a conexão (use em testes / graceful shutdown) */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
    _db     = null;
    mongoStatus.state = "disabled";
  }
}

/** true se o Mongo estiver disponível e conectado */
export function dbReady(): boolean {
  return mongoStatus.state === "ready";
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
process.on("SIGINT",  async () => { await closeDb(); process.exit(0); });
process.on("SIGTERM", async () => { await closeDb(); process.exit(0); });