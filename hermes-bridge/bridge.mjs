#!/usr/bin/env node
/**
 * Hermy HQ ↔ Hermes bridge.
 *
 * Runs on the Mac mini where Hermes lives. Talks to the shared Postgres
 * (the same DATABASE_URL the website uses) — nothing is exposed to the
 * internet. Two jobs:
 *
 *   PULL  (Hermes → website): mirror the kanban board into HermesTask,
 *         cron list + health into DataStore, and emit activity events.
 *   PUSH  (website → Hermes): pick up AgentRequest rows that are `queued`
 *         (safe) or `approved` (human-approved side-effecting), run them
 *         through the `hermes` CLI, and write results back.
 *
 * Requires: the `hermes` binary on PATH, and env DATABASE_URL.
 * Optional env: HERMES_BOARD (default "default"), BRIDGE_POLL_MS (5000),
 *               BRIDGE_MIRROR_MS (30000), HERMES_BIN (default "hermes").
 */
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { telegramEnabled, sendMessage, approvalMessage, baseUrl } from "./telegram.mjs";
import { ccEnabled, ccProbe, ccRun, formatCcResult, ccTarget } from "./claude-code.mjs";
import { classify, briefToPrompt } from "./triage.mjs";

const execFileP = promisify(execFile);
const HERMES = process.env.HERMES_BIN || "hermes";
const BOARD = process.env.HERMES_BOARD || "default";
const POLL_MS = Number(process.env.BRIDGE_POLL_MS || 5000);
const MIRROR_MS = Number(process.env.BRIDGE_MIRROR_MS || 30000);
const NOTIFY_BATCH = Number(process.env.TELEGRAM_NOTIFY_BATCH || 5);
const APPROVAL_TTL_H = Number(process.env.APPROVAL_TTL_HOURS || 24);
const RUN_TIMEOUT_MS = Number(process.env.BRIDGE_RUN_TIMEOUT_MS || 240000);
const WIKI_DIR = process.env.HERMES_WIKI || path.join(os.homedir(), ".hermes", "wiki");
const BRIEF_HOUR = Number(process.env.BRIEF_HOUR || 8);   // local hour to auto-generate the daily brief
const BRIEF_PROMPT =
  "You are the operator's chief of staff. Produce today's brief. Read your memory wiki open-loops " +
  "(~/.hermes/wiki), the kanban board, and recent activity. Output ONLY valid JSON (no prose, no code fences) " +
  'in exactly this shape: {"greeting":"one warm line","summary":"2-3 sentences on where things stand",' +
  '"sections":[{"label":"Needs your decision","items":["..."]},{"label":"Top priorities","items":["..."]},' +
  '{"label":"Recently shipped","items":["..."]},{"label":"Next actions","items":["..."]}]}. ' +
  "Keep every item short, concrete, and specific. Omit a section if it has nothing.";
let lastBriefDate = null;

/* ── instance identity + bus-hygiene knobs ── */
const INSTANCE     = `${os.hostname()}:${process.pid}`;
const BOOT_ISO     = new Date().toISOString();
const CLAIM_BATCH  = Number(process.env.BRIDGE_CLAIM_BATCH || 3);
const STALE_SEC    = Number(process.env.BRIDGE_STALE_SEC || 600);            // 10 min: another instance's run is dead
const TIMEOUT_SEC  = Math.ceil(RUN_TIMEOUT_MS / 1000) + 60;                   // our own run overran its hard timeout
const USAGE_DIR    = process.env.BRIDGE_USAGE_DIR || path.join(os.tmpdir(), "hermes-bridge-usage");
let usageWarned    = false;                                                   // warn-once when usage files never appear

/* ── Phase 3: autonomous triage → Claude Code (Spec E) ── */
const CC_SSH_TIMEOUT_S    = Number(process.env.CC_SSH_TIMEOUT_S || 900);
const CC_TIMEOUT_SEC      = CC_SSH_TIMEOUT_S + 120;                            // E19: sweepStale's kind-aware deadline
const CC_DEFAULT_REPO     = process.env.CC_DEFAULT_REPO || "";
const CC_OFFLINE_NUDGE_MIN = Number(process.env.CC_OFFLINE_NUDGE_MIN || 30);
const TRIAGE_BATCH        = Number(process.env.TRIAGE_BATCH || 2);
const TRIAGE_TIMEOUT_MS   = Number(process.env.TRIAGE_TIMEOUT_MS || 30000);
const HERMES_TRIAGE_MODEL = process.env.HERMES_TRIAGE_MODEL || "";
const HERMES_TRIAGE_PROFILE = process.env.HERMES_TRIAGE_PROFILE || "";

let ccOnline = false;
let ccWarned = false;
let ccOfflineSince = null;
let ccNudgeSent = false;
let triageStats = { classified: 0, exempt: 0, failed: 0, costUsd: 0, routes: { chat: 0, engineering: 0, design: 0, "infra-ops": 0 } };

/* Load hermes-bridge/.env without a dependency. process.env (PM2 ecosystem)
 * always wins — the file only fills gaps. Secrets live here, NOT in the
 * git-tracked ecosystem.config.cjs. */
function loadEnvFile() {
  const f = path.join(path.dirname(new URL(import.meta.url).pathname), ".env");
  let raw; try { raw = fs.readFileSync(f, "utf8"); } catch { return; }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvFile();

const DB_URL = process.env.DATABASE_URL || "";
if (!DB_URL) { console.error("DATABASE_URL is required (use the direct postgres:// URL, not a prisma:// Accelerate URL)"); process.exit(1); }
if (DB_URL.startsWith("prisma://") || DB_URL.startsWith("prisma+")) {
  console.error("DATABASE_URL is a Prisma Accelerate URL; the bridge needs a DIRECT postgres:// connection string (e.g. POSTGRES_URL).");
  process.exit(1);
}
// Cloud Postgres (Prisma Postgres/Neon/Supabase/RDS) needs SSL; localhost doesn't.
const isLocal = /@(localhost|127\.0\.0\.1)/.test(DB_URL);
const pool = new pg.Pool({ connectionString: DB_URL, max: 4, ssl: isLocal ? undefined : { rejectUnauthorized: false } });

const log = (...a) => console.log(new Date().toISOString(), ...a);
const q = (text, params) => pool.query(text, params);

async function hermes(args, { timeout = 30000 } = {}) {
  const { stdout } = await execFileP(HERMES, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

async function emit(kind, title, { detail = null, agent = "hermes", level = "info", meta = null } = {}) {
  await q(
    `INSERT INTO "AgentEvent" (id, kind, title, detail, agent, level, meta, "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
    [randomUUID(), kind, title.slice(0, 200), detail, agent, level, meta ? JSON.stringify(meta) : null]
  );
}

async function setStore(key, data) {
  await q(
    `INSERT INTO "DataStore" (key, data, "updatedAt") VALUES ($1,$2, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
    [key, JSON.stringify(data)]
  );
}

/**
 * Read and delete the JSON usage report `hermes --usage-file` leaves behind.
 * Returns null if it isn't there — which is the expected outcome if HERMES_BIN
 * is a `docker exec` wrapper and USAGE_DIR isn't bind-mounted into the
 * container. We warn once and carry on with NULL telemetry columns; a missing
 * cost number must never fail an otherwise-successful agent run.
 */
function readUsage(file) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch {
    if (!usageWarned) {
      usageWarned = true;
      log(`usage: no report at ${file} — telemetry columns will stay NULL. ` +
          `If HERMES_BIN is a docker wrapper, bind-mount BRIDGE_USAGE_DIR into the container.`);
    }
    return null;
  }
  try { return JSON.parse(raw); } catch { return null; }
  finally { try { fs.unlinkSync(file); } catch { /* best effort */ } }
}

function usageColumns(u, startedMs) {
  return {
    model:      u?.model ?? null,
    tokensIn:   Number.isFinite(u?.input_tokens)  ? u.input_tokens  : null,
    tokensOut:  Number.isFinite(u?.output_tokens) ? u.output_tokens : null,
    costUsd:    Number.isFinite(u?.estimated_cost_usd) ? u.estimated_cost_usd : null,
    durationMs: Date.now() - startedMs,
  };
}

/** Telemetry from the Claude Code runner (E13) — `claude -p --output-format
 *  json` DOES report cost/tokens, unlike the kickoff's assumption. Used for
 *  both the success and failure path: a failed run still cost money. */
function ccColumns(cc, startedMs) {
  return {
    model:      cc?.model ?? null,
    tokensIn:   Number.isFinite(cc?.tokensIn)  ? cc.tokensIn  : null,
    tokensOut:  Number.isFinite(cc?.tokensOut) ? cc.tokensOut : null,
    costUsd:    Number.isFinite(cc?.costUsd)   ? cc.costUsd   : null,
    durationMs: Number.isFinite(cc?.durationMs) ? cc.durationMs : Date.now() - startedMs,
  };
}

/* ─────────────── PULL: mirror Hermes → Postgres ─────────────── */
async function mirrorKanban() {
  let tasks = [];
  try {
    // NB: this Hermes CLI wants --board BEFORE the subcommand.
    const out = await hermes(["kanban", "--board", BOARD, "list", "--json"], { timeout: 15000 });
    const parsed = JSON.parse(out || "[]");
    tasks = Array.isArray(parsed) ? parsed : parsed.tasks || [];
  } catch (e) { log("kanban list failed:", e.message.split("\n")[0]); return; }

  const seen = new Set();
  for (const t of tasks) {
    const id = String(t.id ?? t.task_id ?? "");
    if (!id) continue;
    seen.add(id);
    await q(
      `INSERT INTO "HermesTask" (id, board, title, assignee, status, priority, result, "updatedAt", "syncedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, assignee=EXCLUDED.assignee, status=EXCLUDED.status,
         priority=EXCLUDED.priority, result=EXCLUDED.result, "syncedAt"=now()`,
      [id, BOARD, String(t.title ?? "untitled").slice(0, 300), t.assignee ?? null,
       String(t.status ?? "todo"), t.priority != null ? Number(t.priority) : null,
       t.result ? String(t.result).slice(0, 2000) : null]
    );
  }
  // prune tasks that vanished from the board
  if (seen.size) {
    await q(`DELETE FROM "HermesTask" WHERE board=$1 AND id <> ALL($2::text[])`, [BOARD, [...seen]]);
  } else {
    await q(`DELETE FROM "HermesTask" WHERE board=$1`, [BOARD]);
  }
}

async function mirrorCrons() {
  try {
    const out = await hermes(["cron", "list", "--all"], { timeout: 15000 });
    const lines = out.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    await setStore("hermes-crons", { jobs: lines, raw: out.slice(0, 8000), syncedAt: new Date().toISOString() });
  } catch (e) { log("cron list failed:", e.message.split("\n")[0]); }
}

async function mirrorCost() {
  for (const args of [["insights", "--days", "7"], ["insights"]]) {
    try {
      const out = await hermes(args, { timeout: 15000 });
      await setStore("hermes-cost", { summary: out.slice(0, 4000), syncedAt: new Date().toISOString() });
      return;
    } catch { /* try next arg shape */ }
  }
}

async function mirrorHealth() {
  let online = false, gateway = "unknown", detail = "";
  try {
    const out = await hermes(["status"], { timeout: 12000 });
    detail = out.slice(0, 4000);
    online = /online|running|connected/i.test(out);
    gateway = /gateway[^\n]*(running|online)/i.test(out) ? "running" : "stopped";
  } catch (e) { detail = e.message.split("\n")[0]; }
  await setStore("hermes-health", { online, gateway, detail, lastSeen: new Date().toISOString() });
}

/* ─────────────── Memory Wiki (warm tier: git-tracked markdown) ─────────────── */
function parseEntry(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const fm = {}; let body = md;
  if (m) {
    body = m[2];
    for (const line of m[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (!kv) continue;
      const v = kv[2].trim();
      if (v.startsWith("[") && v.endsWith("]")) fm[kv[1]] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      else fm[kv[1]] = v === "null" || v === "" ? null : v;
    }
  }
  return { fm, body: body.trim() };
}
function walkMd(dir, out = []) {
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) { if (it.name !== ".git") walkMd(full, out); }
    else if (it.name.endsWith(".md") && it.name !== "INDEX.md") out.push(full);
  }
  return out;
}
async function mirrorWiki() {
  if (!fs.existsSync(WIKI_DIR)) return;
  const seen = new Set();
  for (const file of walkMd(WIKI_DIR)) {
    const rel = path.relative(WIKI_DIR, file);
    const id = rel.replace(/\.md$/, "");
    seen.add(id);
    let raw = ""; try { raw = fs.readFileSync(file, "utf8"); } catch { continue; }
    const { fm, body } = parseEntry(raw);
    await q(
      `INSERT INTO "HermesMemory" (id, path, type, title, status, confidence, provenance, tags, links, body, "validFrom", "validTo", "updatedAt", "syncedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), now())
       ON CONFLICT (id) DO UPDATE SET path=EXCLUDED.path, type=EXCLUDED.type, title=EXCLUDED.title,
         status=EXCLUDED.status, confidence=EXCLUDED.confidence, provenance=EXCLUDED.provenance,
         tags=EXCLUDED.tags, links=EXCLUDED.links, body=EXCLUDED.body,
         "validFrom"=EXCLUDED."validFrom", "validTo"=EXCLUDED."validTo", "syncedAt"=now()`,
      [id, rel, fm.type || "fact", fm.title || id, fm.status || "active", fm.confidence || null,
       fm.provenance || null, Array.isArray(fm.tags) ? fm.tags : [], Array.isArray(fm.links) ? fm.links : [],
       body, fm.valid_from || null, fm.valid_to || null]
    );
  }
  if (seen.size) await q(`DELETE FROM "HermesMemory" WHERE id <> ALL($1::text[])`, [[...seen]]);
  else await q(`DELETE FROM "HermesMemory"`);
}
function writeWikiEntry(e) {
  const rel = e.path || `${e.type || "note"}s/${e.id}.md`;
  const full = path.join(WIKI_DIR, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    "---", `id: ${e.id}`, `type: ${e.type || "note"}`, `title: ${e.title}`,
    `status: ${e.status || "active"}`,
    e.confidence ? `confidence: ${e.confidence}` : null,
    `provenance: ${e.provenance || "dashboard"}`,
    `tags: [${(e.tags || []).join(", ")}]`, `links: [${(e.links || []).join(", ")}]`,
    `updated: ${now}`, "---", "", e.body || "", "",
  ].filter((l) => l !== null);
  fs.writeFileSync(full, lines.join("\n"), "utf8");
  return rel;
}
async function gitCommitWiki(msg) {
  try {
    if (!fs.existsSync(path.join(WIKI_DIR, ".git"))) await execFileP("git", ["-C", WIKI_DIR, "init"]).catch(() => {});
    await execFileP("git", ["-C", WIKI_DIR, "add", "-A"]).catch(() => {});
    await execFileP("git", ["-C", WIKI_DIR, "commit", "-m", msg]).catch(() => {});
  } catch { /* ignore */ }
}

/* ─────────────── Chief-of-staff daily brief ─────────────── */
async function generateBriefing() {
  const raw = (await hermes(["-z", BRIEF_PROMPT], { timeout: RUN_TIMEOUT_MS })).trim();
  let brief;
  try {
    const jsonStr = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const m = jsonStr.match(/\{[\s\S]*\}/);
    brief = JSON.parse(m ? m[0] : jsonStr);
  } catch { brief = { summary: raw.slice(0, 1500), sections: [] }; }
  brief.generatedAt = new Date().toISOString();
  await setStore("hermes-briefing", brief);
  await emit("status", "Daily brief generated", { level: "up" });
}
async function maybeDailyBrief() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (now.getHours() >= BRIEF_HOUR && lastBriefDate !== today) {
    lastBriefDate = today;
    try { await generateBriefing(); } catch (e) { log("daily brief err", e.message); }
  }
}

/* ─────────────── PUSH: run website requests via Hermes ─────────────── */
async function runRequest(r) {
  const t0 = Date.now();
  let usage = null;
  let ccTelemetry = null;
  await emit("run", `Started: ${r.title}`, { level: "info", meta: { requestId: r.id, kind: r.kind } });
  const profileArgs = r.profile ? ["--profile", r.profile] : [];
  try {
    let result = "";
    if (r.kind === "oneshot" || r.kind === "chat") {
      // --usage-file is one-shot only and is written even on failure, so it is
      // the one place token/cost telemetry is available without re-plumbing
      // the bridge onto an OpenAI-compatible endpoint.
      fs.mkdirSync(USAGE_DIR, { recursive: true });
      const usagePath = path.join(USAGE_DIR, `${r.id}.json`);
      result = (await hermes([...profileArgs, "--usage-file", usagePath, "-z", r.prompt || r.title],
        { timeout: RUN_TIMEOUT_MS })).trim();
      usage = readUsage(usagePath);
    } else if (r.kind === "kanban") {
      result = (await hermes([...profileArgs, "kanban", "--board", BOARD, "create", "--json", r.title], { timeout: 20000 })).trim();
    } else if (r.kind.startsWith("cron.")) {
      const op = r.kind.split(".")[1];
      const a = JSON.parse(r.prompt || "{}");
      const argv =
        op === "create" ? ["cron", "create", a.schedule, a.prompt || a.name].filter(Boolean)
        : op === "run"    ? ["cron", "run", a.id || a.name]
        : op === "pause"  ? ["cron", "pause", a.id || a.name]
        : op === "resume" ? ["cron", "resume", a.id || a.name]
        : op === "remove" ? ["cron", "remove", a.id || a.name]
        : op === "edit"   ? ["cron", "edit", a.id || a.name]
        : null;
      if (!argv) throw new Error(`unknown cron op ${op}`);
      result = (await hermes([...profileArgs, ...argv], { timeout: 20000 })).trim();
      await mirrorCrons();
    } else if (r.kind === "memory.write") {
      const e = JSON.parse(r.prompt || "{}");
      const rel = writeWikiEntry(e);
      await gitCommitWiki(`wiki: update ${rel} (via dashboard)`);
      await mirrorWiki();
      result = `wrote ${rel}`;
    } else if (r.kind === "briefing.generate") {
      await generateBriefing();
      lastBriefDate = new Date().toISOString().slice(0, 10);
      result = "brief updated";
    } else if (r.kind === "claude-code") {
      if (!r.repoPath) throw new Error("claude-code request has no repoPath");
      const cc = await ccRun({ requestId: r.id, repo: r.repoPath,
                               model: r.ccModel || "sonnet", prompt: r.prompt || r.title });
      if (!cc.ok) { ccTelemetry = cc; throw new Error(cc.error || "claude code failed"); }
      ccTelemetry = cc;
      result = formatCcResult(cc);
    } else {
      throw new Error(`unknown kind ${r.kind}`);
    }
    const u = ccTelemetry ? ccColumns(ccTelemetry, t0) : usageColumns(usage, t0);
    const capped = result.slice(0, 8000);
    await q(
      `UPDATE "AgentRequest"
          SET status='done', result=$2, "finishedAt"=now(), "updatedAt"=now(),
              model=$3, "tokensIn"=$4, "tokensOut"=$5, "costUsd"=$6, "durationMs"=$7
        WHERE id=$1`,
      [r.id, capped, u.model, u.tokensIn, u.tokensOut, u.costUsd, u.durationMs]
    );
    if (r.profile && (r.kind === "oneshot" || r.kind === "chat" || r.kind === "claude-code")) {
      await q(
        `INSERT INTO "ChatMessage" (id, client, role, content, "requestId", "createdAt")
         VALUES ($1,$2,'assistant',$3,$4, now())`,
        [randomUUID(), r.profile, capped, r.id]
      );
    }
    await emit("run", `Done: ${r.title}`, { level: "up", detail: result.slice(0, 400), meta: { requestId: r.id } });
  } catch (e) {
    const msg = (ccTelemetry?.error || e.stderr || e.message || "error").toString().split("\n")[0].slice(0, 600);
    const u = ccTelemetry ? ccColumns(ccTelemetry, t0) : usageColumns(usage, t0);   // a failed run still cost money
    await q(
      `UPDATE "AgentRequest"
          SET status='failed', error=$2, "finishedAt"=now(), "updatedAt"=now(),
              model=$3, "tokensIn"=$4, "tokensOut"=$5, "costUsd"=$6, "durationMs"=$7
        WHERE id=$1`,
      [r.id, msg, u.model, u.tokensIn, u.tokensOut, u.costUsd, u.durationMs]
    );
    await emit("run", `Failed: ${r.title}`, { level: "down", detail: msg, meta: { requestId: r.id } });
    log("request failed:", r.id, msg);
  }
}

/**
 * Classify `chat` rows that have never been triaged (Spec E, E5/E6/E9).
 * Runs at the head of the queue tick, BEFORE claimBatch() — the only
 * placement where `queued → awaiting_approval` stays honest, since the row
 * can never already be `running` here.
 *
 * Escalate-only: this function may only raise a verdict toward
 * claude-code/awaiting_approval. It never writes status='queued' or
 * sideEffecting=false — that would undo the POST route's own regex belt.
 */
async function triageBatch() {
  const client = await pool.connect();
  const events = [];
  try {
    await client.query("BEGIN");
    const { rows: locked } = await client.query(
      `SELECT id, prompt, title, profile, "sideEffecting", status
         FROM "AgentRequest"
        WHERE kind = 'chat' AND "triagedAt" IS NULL
          AND status IN ('queued','awaiting_approval')
        ORDER BY "createdAt" ASC LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [TRIAGE_BATCH]
    );
    if (!locked.length) { await client.query("COMMIT"); return; }

    // Independent calls — Promise.all so a batch of 2 costs ~one LLM round
    // trip, not two serial ones eating into the 5s tick.
    const verdicts = await Promise.all(locked.map(async (r) => {
      const verdict = await classify(r.prompt || r.title || "", {
        hermes,
        profile: HERMES_TRIAGE_PROFILE || r.profile,
        model: HERMES_TRIAGE_MODEL || null,
        usageDir: USAGE_DIR,
        requestId: r.id,
        timeoutMs: TRIAGE_TIMEOUT_MS,
      }).catch(() => ({ route: "chat", failed: true })); // E7: any throw ⇒ chat, never a stalled queue
      return { row: r, verdict };
    }));

    for (const { row: r, verdict } of verdicts) {
      if (verdict.exempt) triageStats.exempt++;
      else if (verdict.failed) triageStats.failed++;
      else triageStats.classified++;
      if (verdict.route && verdict.route in triageStats.routes) triageStats.routes[verdict.route]++;
      if (verdict.usagePath) {
        const u = readUsage(verdict.usagePath);
        if (Number.isFinite(u?.estimated_cost_usd)) triageStats.costUsd += u.estimated_cost_usd;
      }

      let repoPath = null;
      if (verdict.route !== "chat") {
        const { rows: clientRows } = await client.query(
          `SELECT "repoPath" FROM "Client" WHERE "hermesProfile" = $1 OR slug = $1 ORDER BY ("hermesProfile" = $1) DESC LIMIT 1`,
          [r.profile]
        );
        repoPath = clientRows[0]?.repoPath || CC_DEFAULT_REPO || null;
      }

      // E12: no repo (or CC disabled) ⇒ downgrade to chat, whatever the verdict said.
      if (verdict.route === "chat" || !repoPath || !ccEnabled()) {
        await client.query(`UPDATE "AgentRequest" SET "triagedAt" = now() WHERE id = $1`, [r.id]);
        continue;
      }

      await client.query(
        `UPDATE "AgentRequest"
            SET kind = 'claude-code', "ccModel" = $2, "repoPath" = $3, prompt = $4,
                "triagedAt" = now(), "sideEffecting" = true,
                status = CASE WHEN status = 'awaiting_approval' THEN status ELSE 'awaiting_approval' END,
                "flagReason" = COALESCE("flagReason", $5)
          WHERE id = $1`,
        [r.id, verdict.model, repoPath, briefToPrompt(verdict, r.prompt || r.title || ""), verdict.reason || null]
      );
      events.push({ requestId: r.id, title: r.title, route: verdict.route, model: verdict.model });
    }

    await client.query("COMMIT");
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
    throw e;
  } finally {
    client.release();
  }

  // Emitted after commit, and only for non-chat verdicts — chat is the
  // common case and would drown the activity feed.
  for (const ev of events) {
    await emit("run", `Triaged: ${ev.title}`, { level: "info", meta: { requestId: ev.requestId, route: ev.route, model: ev.model } });
  }
}

/**
 * Claim up to CLAIM_BATCH runnable rows atomically.
 *
 * SELECT … FOR UPDATE SKIP LOCKED inside one transaction is the whole
 * point: a second bridge instance (or this one after a PM2 restart that
 * left the old process briefly alive) sees the locked rows, skips them,
 * and claims different work. Side-effecting commands can never run twice.
 *
 * The claim itself flips status to 'running' and stamps claimedBy/claimedAt,
 * so ownership is durable the moment the transaction commits — before any
 * subprocess starts.
 *
 * Spec E gates: a 'chat' row must be triaged first (triagedAt set), and a
 * 'claude-code' row is only claimable while the Mac is reachable — an
 * offline Mac means the row simply is not claimed (E3, hold-don't-fail).
 */
async function claimBatch() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: locked } = await client.query(
      `SELECT id FROM "AgentRequest"
        WHERE status IN ('queued','approved')
          AND (kind <> 'chat' OR "triagedAt" IS NOT NULL)
          AND (kind <> 'claude-code' OR $2)
        ORDER BY "createdAt" ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [CLAIM_BATCH, ccOnline]
    );
    if (!locked.length) { await client.query("COMMIT"); return []; }
    const { rows: claimed } = await client.query(
      `UPDATE "AgentRequest"
          SET status='running', "claimedAt"=now(), "claimedBy"=$2,
              "startedAt"=now(), "updatedAt"=now()
        WHERE id = ANY($1::text[])
      RETURNING *`,
      [locked.map((r) => r.id), INSTANCE]
    );
    await client.query("COMMIT");
    return claimed;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* connection may be gone */ }
    throw e;
  } finally {
    client.release();
  }
}

async function processQueue() {
  const rows = await claimBatch();
  for (const r of rows) await runRequest(r);
}

/**
 * Two failure modes, one sweep:
 *
 *  (a) STALE — a row is 'running' but its owner is not us. Either a second
 *      instance died, or this process is a restart of the one that claimed it
 *      (new pid ⇒ new INSTANCE string). The subprocess is gone; the row would
 *      sit 'running' forever. Fail it.
 *
 *  (b) TIMEOUT — a row we own has outlived RUN_TIMEOUT_MS + 60s. execFile's
 *      own timeout should have fired and taken the catch path; if we are here,
 *      the process is wedged (hung docker exec, stuck TTY). Fail it so the
 *      chat UI stops showing a typing indicator forever.
 *
 * COALESCE("claimedAt","startedAt") covers rows that entered 'running' before
 * this code shipped and therefore have no claimedAt.
 */
async function sweepStale() {
  const { rows: dead } = await q(
    `UPDATE "AgentRequest"
        SET status='failed',
            error=COALESCE(NULLIF(error,''), 'stale: bridge restarted or instance died (claimedBy=' || COALESCE("claimedBy",'unknown') || ')'),
            "finishedAt"=now(), "updatedAt"=now()
      WHERE status='running'
        AND "claimedBy" IS DISTINCT FROM $1
        AND COALESCE("claimedAt","startedAt") < now() - make_interval(secs => $2::int)
      RETURNING id, title`,
    [INSTANCE, STALE_SEC]
  );

  const { rows: timedOut } = await q(
    `UPDATE "AgentRequest"
        SET status='failed',
            error=COALESCE(NULLIF(error,''), 'timeout: exceeded ' || (CASE WHEN kind = 'claude-code' THEN $3 ELSE $2 END) || 's with no result'),
            "finishedAt"=now(), "updatedAt"=now()
      WHERE status='running'
        AND "claimedBy" = $1
        AND COALESCE("claimedAt","startedAt") < now() - make_interval(secs => CASE WHEN kind = 'claude-code' THEN $3::int ELSE $2::int END)
      RETURNING id, title`,
    [INSTANCE, TIMEOUT_SEC, CC_TIMEOUT_SEC]
  );

  for (const r of [...dead, ...timedOut]) {
    log("swept stale request:", r.id, r.title);
    await emit("run", `Swept: ${r.title}`, { level: "down", meta: { requestId: r.id, reason: "stale" } });
  }

  /* (c) EXPIRED — an approval nobody answered inside the TTL. A solo
   * operator's queue must self-clean or it becomes guilt (Fable §4.4).
   * Terminal: the PATCH route's 409-guard already refuses to decide it,
   * and the UI offers "Chạy lại" instead. */
  const { rows: expired } = await q(
    `UPDATE "AgentRequest"
        SET status='expired',
            error=COALESCE(NULLIF(error,''), 'expired: awaiting approval >' || $1 || 'h'),
            "finishedAt"=now(), "updatedAt"=now()
      WHERE status='awaiting_approval'
        AND "createdAt" < now() - make_interval(hours => $1)
      RETURNING id, title`,
    [APPROVAL_TTL_H]
  );
  for (const r of expired) {
    log("expired approval:", r.id, r.title);
    await emit("run", `Expired: ${r.title}`, { level: "warn", meta: { requestId: r.id, reason: "expired" } });
  }

  return dead.length + timedOut.length + expired.length;
}

/**
 * Push a Telegram alert the moment a request enters awaiting_approval.
 *
 * Claim-then-send (D15): the CTE stamps notifiedAt inside the same statement
 * that selects the rows, under FOR UPDATE SKIP LOCKED — so two bridge
 * instances can never both alert on one row. If the send fails we clear
 * notifiedAt again, so the next tick retries; only a hard kill inside that
 * ~200ms window loses an alert, and /approvals still shows the row.
 *
 * Batched at NOTIFY_BATCH per tick so a backlog can't trip Telegram's rate
 * limit — the remainder goes out on the following ticks.
 */
async function notifyPending() {
  if (!telegramEnabled()) return 0;
  const { rows } = await q(
    `WITH claimed AS (
       UPDATE "AgentRequest" SET "notifiedAt" = now()
        WHERE id IN (
          SELECT id FROM "AgentRequest"
           WHERE status = 'awaiting_approval' AND "notifiedAt" IS NULL
             AND (kind <> 'chat' OR "triagedAt" IS NOT NULL)
           ORDER BY "createdAt" ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
       RETURNING id, title, kind, profile, "flagReason"
     )
     SELECT c.*, cl.slug AS "clientSlug", cl.name AS "clientName"
       FROM claimed c
       LEFT JOIN LATERAL (
         SELECT slug, name FROM "Client"
          WHERE "hermesProfile" = c.profile OR slug = c.profile
          ORDER BY ("hermesProfile" = c.profile) DESC
          LIMIT 1
       ) cl ON true`,
    [NOTIFY_BATCH]
  );

  let sent = 0;
  for (const r of rows) {
    const ok = await sendMessage(approvalMessage({
      clientName: r.clientName, clientSlug: r.clientSlug,
      title: r.title, kind: r.kind, flagReason: r.flagReason,
    }));
    if (ok) { sent++; continue; }
    // Un-claim so the next tick retries.
    await q(`UPDATE "AgentRequest" SET "notifiedAt" = NULL WHERE id = $1`, [r.id]);
  }
  if (sent) log(`telegram: notified ${sent} approval${sent > 1 ? "s" : ""}`);
  return sent;
}

/**
 * One DataStore row the dashboard can read to answer "is the bridge alive?".
 * Written every mirror tick (30s), so `now - lastSeen > 90s` means trouble.
 * Queue depths ride along so the cockpit's status strip needs one fetch.
 */
async function heartbeat() {
  const { rows } = await q(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('queued','approved'))  AS queued,
       COUNT(*) FILTER (WHERE status = 'running')               AS running,
       COUNT(*) FILTER (WHERE status = 'awaiting_approval')     AS awaiting,
       COUNT(*) FILTER (WHERE status = 'failed'
                          AND "createdAt" > now() - interval '24 hours') AS failed24h,
       COUNT(*) FILTER (WHERE status = 'expired'
                          AND "createdAt" > now() - interval '24 hours') AS expired24h,
       COUNT(*) FILTER (WHERE status IN ('queued','approved')
                          AND kind = 'claude-code')              AS "ccQueued"
     FROM "AgentRequest"`
  );
  const c = rows[0] || {};
  await setStore("bridge-heartbeat", {
    lastSeen: new Date().toISOString(),
    host: os.hostname(),
    pid: process.pid,
    instance: INSTANCE,
    board: BOARD,
    bootedAt: BOOT_ISO,
    queued:     Number(c.queued     || 0),
    running:    Number(c.running    || 0),
    awaiting:   Number(c.awaiting   || 0),
    failed24h:  Number(c.failed24h  || 0),
    expired24h: Number(c.expired24h || 0),
    ccEnabled:  ccEnabled(),
    ccOnline,
    ccQueued:   Number(c.ccQueued   || 0),
  });
}

/**
 * Reachability probe (Spec E, E3/E-6 step 7-8). Warn-once, never throw.
 * An unreachable Mac must never crash the mirror tick — a `claude-code` row
 * simply stays unclaimed (claimBatch()'s `$2 = ccOnline` gate) until the
 * next probe finds the Mac back.
 */
async function ccReachabilityTick() {
  if (!ccEnabled()) return;
  const was = ccOnline;
  ccOnline = await ccProbe();

  if (ccOnline && !was) {
    log(`cc: Mac reachable via ${ccTarget()} (runner ok)`);
    ccWarned = false; ccOfflineSince = null; ccNudgeSent = false;
  }
  if (!ccOnline && !ccWarned) {
    ccWarned = true;
    ccOfflineSince = ccOfflineSince ?? Date.now();
    log("cc: Mac unreachable — claude-code requests will hold (queued, not failed)");
  }
  if (!ccOnline && ccOfflineSince && !ccNudgeSent &&
      Date.now() - ccOfflineSince > CC_OFFLINE_NUDGE_MIN * 60000) {
    const { rows } = await q(
      `SELECT COUNT(*)::int AS n FROM "AgentRequest" WHERE status = 'queued' AND kind = 'claude-code'`
    );
    const n = rows[0]?.n || 0;
    if (n > 0 && telegramEnabled()) {
      const ok = await sendMessage(`${n} tác vụ Claude Code đang chờ máy Mac online`);
      if (ok) ccNudgeSent = true; // one nudge; doesn't repeat until reconnect resets the flag
    }
  }
}

/**
 * Cumulative triage counters (Spec E, E22/E-8), written once per mirror
 * tick — not per classification, so a burst of chat traffic doesn't turn
 * into a write storm. Replaces §6's cost *estimate* with a measured figure.
 */
async function writeTriageStats() {
  await setStore("triage-stats", { ...triageStats, updatedAt: new Date().toISOString() });
}

/* ─────────────── loops ─────────────── */
async function mirrorTick() {
  try { await sweepStale();     } catch (e) { log("sweepStale err", e.message); }
  try { await ccReachabilityTick(); } catch (e) { log("cc probe err", e.message); }
  try { await mirrorKanban();   } catch (e) { log("mirrorKanban err", e.message); }
  try { await mirrorCrons();    } catch (e) { log("mirrorCrons err", e.message); }
  try { await mirrorHealth();   } catch (e) { log("mirrorHealth err", e.message); }
  try { await mirrorWiki();     } catch (e) { log("mirrorWiki err", e.message); }
  try { await mirrorCost();     } catch (e) { log("mirrorCost err", e.message); }
  try { await maybeDailyBrief();} catch (e) { log("maybeDailyBrief err", e.message); }
  try { await heartbeat();      } catch (e) { log("heartbeat err", e.message); }
  try { await writeTriageStats();} catch (e) { log("triageStats err", e.message); }
}

async function main() {
  log(`hermes-bridge up · instance=${INSTANCE} · board=${BOARD} · poll=${POLL_MS}ms · mirror=${MIRROR_MS}ms · usageDir=${USAGE_DIR}`);
  log(telegramEnabled()
    ? `telegram: enabled (chat=${String(process.env.TELEGRAM_CHAT_ID).slice(0, 4)}…, base=${baseUrl()})`
    : "telegram: disabled (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID unset) — approvals will not be pushed");
  await emit("status", "Bridge connected", { level: "up" });
  await mirrorTick();
  setInterval(() => mirrorTick().catch((e) => log("mirror loop", e.message)), MIRROR_MS);
  // queue loop
  const tick = async () => {
    try { await triageBatch(); } catch (e) { log("triage loop", e.message); }
    try { await processQueue(); } catch (e) { log("queue loop", e.message); }
    try { await notifyPending(); } catch (e) { log("notify loop", e.message); }
    finally { setTimeout(tick, POLL_MS); }
  };
  tick();
}
main().catch((e) => { console.error("fatal", e); process.exit(1); });
