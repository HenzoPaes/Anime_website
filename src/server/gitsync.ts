// src/server/gitSync.ts
// Backup MongoDB → GitHub branch "data"
//
// Fluxo:
//   1. scheduleBackup() é chamado após cada escrita no Mongo (debounced 10min)
//   2. _doBackup() exporta Mongo → JSON → git commit → push branch data
//   3. Backup manual disponível via POST /api/git/backup
//   4. Auto-backup agendado a cada 6h via setInterval
//
// O GitHub NÃO é mais lido na inicialização — o Mongo é a fonte de verdade.
// Se o Mongo estiver vazio E o GitHub tiver dados, o animes.ts faz seed automático.

import { execSync, exec } from "child_process";
import fs from "fs";
import path from "path";
import { Router } from "express";

const REPO   = process.env.GITHUB_REPO ?? "https://github.com/HenzoPaes/Anime_website.git";
const BRANCH = "data";
const CWD    = process.cwd();

// ── Estado ────────────────────────────────────────────────────────────────────
export interface BackupStatus {
  lastBackup:   Date | null;
  lastMsg:      string;
  pending:      boolean;
  error:        string | null;
  backupCount:  number;
  nextAuto:     Date | null;
}

export const backupStatus: BackupStatus = {
  lastBackup:  null,
  lastMsg:     "Nenhum backup realizado",
  pending:     false,
  error:       null,
  backupCount: 0,
  nextAuto:    null,
};

// ── Debounce (10 minutos) ─────────────────────────────────────────────────────
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS   = 10 * 60 * 1000; // 10 min
const AUTO_INTERVAL = 6  * 60 * 60 * 1000; // 6h

export function scheduleBackup(reason: string): void {
  backupStatus.pending = true;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    runBackup(reason).catch(err => {
      backupStatus.error = String(err);
      console.error("[gitSync] Backup falhou:", err);
    });
  }, DEBOUNCE_MS);
}

// ── Auto-backup a cada 6h ─────────────────────────────────────────────────────
export function startAutoBackup(): void {
  const next = new Date(Date.now() + AUTO_INTERVAL);
  backupStatus.nextAuto = next;
  setInterval(async () => {
    console.log("[gitSync] 🕐 Auto-backup iniciado...");
    await runBackup("auto 6h");
    backupStatus.nextAuto = new Date(Date.now() + AUTO_INTERVAL);
  }, AUTO_INTERVAL);
  console.log(`[gitSync] Auto-backup agendado a cada 6h. Próximo: ${next.toLocaleString("pt-BR")}`);
}

// ── Git helpers ───────────────────────────────────────────────────────────────
function run(cmd: string): string {
  return execSync(cmd, { cwd: CWD, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function runAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) =>
    exec(cmd, { cwd: CWD, encoding: "utf-8" }, (err, out, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve((out + stderr).trim())));
}

function ensureRemote() {
  try {
    const remotes = run("git remote");
    remotes.split("\n").includes("origin")
      ? run(`git remote set-url origin ${REPO}`)
      : run(`git remote add origin ${REPO}`);
  } catch {}
}

function ensureBranch() {
  const cur = run("git branch --show-current");
  if (cur !== BRANCH) {
    try { run(`git checkout ${BRANCH}`); }
    catch { run(`git checkout -B ${BRANCH}`); }
  }
}

// ── Backup principal ───────────────────────────────────────────────────────────
export async function runBackup(reason: string): Promise<string> {
  console.log(`[gitSync] 💾 Backup → GitHub (${reason})`);

  // Import late para evitar circular dependency
  const { dumpAllForBackup } = await import("./animes");

  try {
    // 1. Exporta tudo do Mongo para JSON
    const { animes, pageconfig, userData } = await dumpAllForBackup();

    // 2. Escreve os arquivos
    fs.writeFileSync(
      path.join(CWD, "output.json"),
      JSON.stringify(animes, null, 2), "utf-8",
    );

    if (Object.keys(pageconfig).length) {
      fs.writeFileSync(
        path.join(CWD, "pageconfig.json"),
        JSON.stringify(pageconfig, null, 2), "utf-8",
      );
    }

    // userData/<uuid>/<collection>.json
    const udDir = path.join(CWD, "userData");
    if (!fs.existsSync(udDir)) fs.mkdirSync(udDir, { recursive: true });
    for (const { userId, collection, data } of userData) {
      const dir = path.join(udDir, userId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${collection}.json`),
        JSON.stringify(data), "utf-8",
      );
    }

    // 3. Git commit + push
    ensureRemote();
    ensureBranch();

    for (const target of ["output.json", "pageconfig.json", "userData/"]) {
      try { run(`git add ${target}`); } catch {}
    }

    const status = run("git status --porcelain");
    if (!status) {
      console.log("[gitSync] Nada a commitar.");
      backupStatus.pending = false;
      return "✅ Já sincronizado";
    }

    const ts  = new Date().toLocaleString("pt-BR");
    run(`git commit -m "[backup] ${reason} — ${ts}"`);
    const out = await runAsync(`git push origin ${BRANCH}`);

    backupStatus.lastBackup  = new Date();
    backupStatus.lastMsg     = `${ts} — ${reason}`;
    backupStatus.pending     = false;
    backupStatus.error       = null;
    backupStatus.backupCount += 1;
    console.log(`[gitSync] ✅ Backup concluído (${backupStatus.backupCount})`);
    return `✅ Backup #${backupStatus.backupCount} concluído`;
  } catch (e: any) {
    const msg = e.message?.slice(0, 160) ?? String(e);
    backupStatus.error   = msg;
    backupStatus.pending = false;
    console.error("[gitSync] ❌", msg);
    return `❌ ${msg}`;
  }
}

// ── Express Router ─────────────────────────────────────────────────────────────
export function createGitRouter(): Router {
  const router = Router();

  // GET /api/git/status
  router.get("/status", (_req, res) => {
    res.json({
      ...backupStatus,
      lastBackup: backupStatus.lastBackup?.toISOString() ?? null,
      nextAuto:   backupStatus.nextAuto?.toISOString()   ?? null,
    });
  });

  // POST /api/git/backup  { message?: string }
  router.post("/backup", async (req, res) => {
    const msg = req.body?.message || "manual backup";
    // Cancela debounce pendente e faz backup imediato
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    const result = await runBackup(msg);
    res.json({ success: !backupStatus.error, result });
  });

  return router;
}