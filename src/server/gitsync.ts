// src/server/gitSync.ts
// Auto-sincroniza arquivos do servidor com o branch "data" do GitHub.
// Uso:
//   import { scheduleUserDataSync, gitPull, gitStatus } from "./gitSync";
//   scheduleUserDataSync("watchlist atualizado"); // debounced, aguarda 8s
//   await gitPull();                              // puxar no startup

import { execSync, exec } from "child_process";
import path from "path";

const REPO    = "https://github.com/HenzoPaes/Anime_website.git";
const BRANCH  = "data";
const CWD     = process.cwd();

// ── Estado público ─────────────────────────────────────────────────────────────

export interface SyncStatus {
  lastSync:   Date | null;
  lastMsg:    string;
  pending:    boolean;
  error:      string | null;
  commitCount:number;
}

export const syncStatus: SyncStatus = {
  lastSync:    null,
  lastMsg:     "Nunca sincronizado",
  pending:     false,
  error:       null,
  commitCount: 0,
};

// ── Debounce timer ─────────────────────────────────────────────────────────────

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 8_000; // aguarda 8s de inatividade antes de commitar

/**
 * Agenda um commit+push para userData.
 * Chamadas repetidas dentro de 8s são agrupadas em um único commit.
 */
export function scheduleUserDataSync(reason: string = "userData update"): void {
  syncStatus.pending = true;

  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    _doSync(reason).catch(err => {
      syncStatus.error = String(err);
      console.error("[gitSync] Erro:", err);
    });
  }, DEBOUNCE_MS);
}

// ── Git helpers ────────────────────────────────────────────────────────────────

function run(cmd: string): string {
  return execSync(cmd, { cwd: CWD, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: CWD, encoding: "utf-8" }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve((stdout + stderr).trim());
    });
  });
}

/** Garante que o remote está configurado corretamente */
function ensureRemote(): void {
  try {
    const remotes = run("git remote");
    if (remotes.split("\n").includes("origin")) {
      run(`git remote set-url origin ${REPO}`);
    } else {
      run(`git remote add origin ${REPO}`);
    }
  } catch {}
}

/** Garante que estamos no branch correto */
function ensureBranch(): void {
  const current = run("git branch --show-current");
  if (current !== BRANCH) {
    try {
      run(`git checkout ${BRANCH}`);
    } catch {
      run(`git checkout -B ${BRANCH}`);
    }
  }
}

// ── Pull (startup) ─────────────────────────────────────────────────────────────

/**
 * Puxar últimos dados do GitHub.
 * Chamado no startup do servidor para pegar userData mais recente.
 */
export async function gitPull(): Promise<string> {
  console.log("[gitSync] 🔄 Puxando dados do GitHub...");
  try {
    ensureRemote();
    ensureBranch();
    // Fetch sem merge (seguro) depois aplica somente o que mudou
    const out = await runAsync(`git pull --rebase=false origin ${BRANCH} --allow-unrelated-histories`);
    console.log("[gitSync] ✅ Pull concluído:", out.slice(0, 100));
    syncStatus.error   = null;
    syncStatus.lastMsg = `Pull: ${new Date().toLocaleTimeString("pt-BR")}`;
    return out;
  } catch (e: any) {
    const msg = `Pull falhou: ${e.message}`;
    console.warn("[gitSync] ⚠️", msg);
    syncStatus.error = msg;
    // Falha no pull não bloqueia o servidor — dados locais são suficientes
    return msg;
  }
}

// ── Commit + Push ──────────────────────────────────────────────────────────────

async function _doSync(reason: string): Promise<void> {
  console.log(`[gitSync] 💾 Commitando dados... (${reason})`);
  try {
    ensureRemote();
    ensureBranch();

    // Adiciona todos os arquivos de dados do site
    const targets = ["output.json", "pageconfig.json", "userData/", "api/Animes/"];
    for (const t of targets) {
      try { run(`git add ${t}`); } catch {}  // ignora se não existir
    }

    // Verifica se há algo para commitar
    const status = run("git status --porcelain");
    if (!status) {
      console.log("[gitSync] Nada a commitar.");
      syncStatus.pending = false;
      return;
    }

    const ts  = new Date().toLocaleString("pt-BR");
    const msg = `[auto] sync — ${reason} — ${ts}`;
    run(`git commit -m "${msg.replace(/"/g, "'")}"`);

    const pushOut = await runAsync(`git push origin ${BRANCH}`);
    console.log("[gitSync] ✅ Push concluído:", pushOut.slice(0, 80));

    syncStatus.lastSync    = new Date();
    syncStatus.lastMsg     = `Sync: ${ts}`;
    syncStatus.pending     = false;
    syncStatus.error       = null;
    syncStatus.commitCount += 1;
  } catch (e: any) {
    const msg = `Sync falhou: ${e.message?.slice(0, 120)}`;
    console.error("[gitSync] ❌", msg);
    syncStatus.error   = msg;
    syncStatus.pending = false;
  }
}

// ── Push forçado (admin) ───────────────────────────────────────────────────────

/**
 * Push imediato, sem debounce. Usado pelo admin para forçar sync.
 */
export async function gitPushNow(reason: string = "admin push"): Promise<string> {
  if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  try {
    await _doSync(reason);
    return syncStatus.error ?? `✅ Push concluído! (${syncStatus.commitCount} commits)`;
  } catch (e: any) {
    return `❌ ${e.message}`;
  }
}

// ── Rota Express para status/push do admin ────────────────────────────────────

import { Router } from "express";

export function createGitRouter(): Router {
  const router = Router();

  // GET /api/git/status
  router.get("/status", (_req, res) => {
    res.json({
      ...syncStatus,
      lastSync: syncStatus.lastSync?.toISOString() ?? null,
    });
  });

  // POST /api/git/push   { message?: string }
  router.post("/push", async (req, res) => {
    const msg = req.body?.message || "manual push";
    const result = await gitPushNow(msg);
    res.json({ success: !syncStatus.error, result });
  });

  // POST /api/git/pull
  router.post("/pull", async (_req, res) => {
    const result = await gitPull();
    res.json({ success: !syncStatus.error, result });
  });

  return router;
}