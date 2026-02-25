// src/server/animes.ts
import fs from "fs";
import path from "path";

const ANIMES_DIR = path.join(process.cwd(), "Animes");
const BACKUP_DIR = path.join(process.cwd(), "backups");
const API_KEY = process.env.API_KEY || "dev-key";

// Garante que as pastas existam
export function ensureDirs() {
  if (!fs.existsSync(ANIMES_DIR)) fs.mkdirSync(ANIMES_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export async function readAllAnimes() {
  // first try local files
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
    if (local.length > 0) return local;
  } catch (e) {
    console.error("Erro ao listar Animes/:", (e as any).message);
    // fall through to remote
  }

  // if we got here, either directory empty or had error -> fetch from GitHub
  try {
    console.log("Downloading anime list from GitHub fallback...");
    const apiUrl =
      "https://api.github.com/repos/HenzoPaes/Anime_website/contents/Animes";
    const listRes = await fetch(apiUrl);
    if (!listRes.ok)
      throw new Error(`${listRes.status} ${listRes.statusText}`);
    const list = await listRes.json();
    if (!Array.isArray(list)) return [];
    const animes = [];
    for (const file of list.filter(
      (f: any) => f.name && f.name.endsWith(".json")
    )) {
      try {
        const animeRes = await fetch(file.download_url);
        if (!animeRes.ok) throw new Error(`${animeRes.status}`);
        const anime = await animeRes.json();
        animes.push(anime);
      } catch (err) {
        console.error(
          `Erro ao baixar ${file.name} de GitHub:`,
          (err as any).message || err
        );
      }
    }
    return animes;
  } catch (err) {
    console.error(
      "Erro ao baixar animes do GitHub:",
      (err as any).message || err
    );
    return [];
  }
}

export async function readAnime(id: string) {
  const p = path.join(ANIMES_DIR, `${id}.json`);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      /* continue to remote */
    }
  }
  // fallback to GitHub raw file
  try {
    const url = `https://raw.githubusercontent.com/HenzoPaes/Anime_website/main/Animes/${id}.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`Erro ao buscar anime ${id} no GitHub:`, (err as any).message || err);
    return null;
  }
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
