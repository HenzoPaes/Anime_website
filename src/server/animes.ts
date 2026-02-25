// src/server/animes.ts
import fs from "fs";
import path from "path";

// apontar diretamente para a pasta usada pelas APIs estáticas
const ANIMES_DIR = path.join(process.cwd(), "Api", "Animes");
const BACKUP_DIR = path.join(process.cwd(), "backups");
const API_KEY = process.env.API_KEY || "dev-key";

// Garante que as pastas existam
export function ensureDirs() {
  if (!fs.existsSync(ANIMES_DIR)) fs.mkdirSync(ANIMES_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function readAllAnimes() {
  // apenas lê arquivos locais; nenhuma tentativa de baixar do GitHub
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
  return null; // não faz download remoto
}

export function writeAnime(anime: any) {
  const id = anime.id;
  const p = path.join(ANIMES_DIR, `${id}.json`);
  // Backup antes de sobrescrever
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
