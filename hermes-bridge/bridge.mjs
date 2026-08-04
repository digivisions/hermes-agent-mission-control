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
import { telegramEnabled, sendMessage, approvalMessage, baseUrl, getUpdates } from "./telegram.mjs";
import { ccEnabled, ccProbe, ccRun, ccUsageProbe, formatCcResult, ccTarget } from "./claude-code.mjs";
import { classify, briefToPrompt } from "./triage.mjs";
import { collectInfra } from "./infra.mjs";
import * as assistant from "./assistant.mjs";

/* Load hermes-bridge/.env without a dependency. process.env (PM2 ecosystem)
 * always wins — the file only fills gaps. Secrets live here, NOT in the
 * git-tracked ecosystem.config.cjs. Must run before ANY process.env.X read
 * below — every const in this module that falls back to a `.env`-only var
 * (not also set in ecosystem.config.cjs) needs loadEnvFile() to have already
 * run, since top-level consts are evaluated once, immediately. */
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

// When HERMES_BIN is a `docker exec` wrapper, the usage file is written by
// the container's user and its parent dir is typically not traversable by
// the bridge's host user even if the leaf file/dir itself is world-readable
// (a 700 ancestor blocks traversal regardless of the leaf's own mode). Set
// BRIDGE_USAGE_DOCKER to the container name to read the file back out via
// `docker exec <container> cat <path>` instead of the host filesystem.
const USAGE_DOCKER          = process.env.BRIDGE_USAGE_DOCKER || "";
const USAGE_DOCKER_HOST_PFX = process.env.BRIDGE_USAGE_DOCKER_HOST_PREFIX || USAGE_DIR;
const USAGE_DOCKER_CTR_PFX  = process.env.BRIDGE_USAGE_DOCKER_CONTAINER_PREFIX || "";

/* ── Phase 3: autonomous triage → Claude Code (Spec E) ── */
const CC_SSH_TIMEOUT_S    = Number(process.env.CC_SSH_TIMEOUT_S || 900);
const CC_TIMEOUT_SEC      = CC_SSH_TIMEOUT_S + 120;                            // E19: sweepStale's kind-aware deadline
const CC_DEFAULT_REPO     = process.env.CC_DEFAULT_REPO || "";
const CC_OFFLINE_NUDGE_MIN = Number(process.env.CC_OFFLINE_NUDGE_MIN || 30);
const TRIAGE_BATCH        = Number(process.env.TRIAGE_BATCH || 2);
const TRIAGE_TIMEOUT_MS   = Number(process.env.TRIAGE_TIMEOUT_MS || 30000);
const HERMES_TRIAGE_MODEL = process.env.HERMES_TRIAGE_MODEL || "";
const HERMES_TRIAGE_PROFILE = process.env.HERMES_TRIAGE_PROFILE || "";

/* ── Phase 4: Krisna, the proactive assistant layer (Spec F) ── */
const DIGEST_PROFILE = process.env.DIGEST_PROFILE || "admin";
const ASSISTANT_TELEGRAM_INBOUND = process.env.ASSISTANT_TELEGRAM_INBOUND !== "0";

let ccOnline = false;
let ccWarned = false;
let ccOfflineSince = null;
let triageStats = { classified: 0, exempt: 0, failed: 0, costUsd: 0, routes: { chat: 0, engineering: 0, design: 0, "infra-ops": 0 } };

/* ── Phase G: Claude Code usage gauge (Spec G) ──
 * All state here is best-effort, PM2-restart-safe (a lost `rawNote`/throttle
 * clock just means one extra read or one dropped breadcrumb, never a crash),
 * and MUST stay isolated from `ccOnline` — see ccUsageTick()'s docstring. */
const CC_USAGE_THROTTLE_MS = Math.max(15 * 60 * 1000, Number(process.env.CC_USAGE_THROTTLE_MS || 20 * 60 * 1000));
const CC_USAGE_WRITE_MIN_MS = 5 * 60 * 1000;
const CC_RATE_LIMIT_RE = /grace-(5h|7d)-utilization|(?:^|\D)429(?:\D|$)|usage limit|rate limit|quota exceed/i;
let ccUsageLastAttemptAt = 0;      // ms epoch — bridge-side 20min floor (G-D5)
let ccUsageNextAttemptAt = 0;      // ms epoch — pushed out by a Mac-reported retryAfterS
let ccUsageLastWriteAt = 0;
let ccUsageLastPayloadJson = null; // for the byte-identical write-throttle check
let ccRateLimitNote = null;        // short derived string only (G-R5) — most recent event

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

async function getStore(key) {
  const { rows } = await q(`SELECT data FROM "DataStore" WHERE key=$1`, [key]);
  return rows[0]?.data ?? null;
}

/* ── Phase 4: Krisna config/state (Spec F, F-3 step 3) ── */
async function readConfig() {
  return assistant.normalizeConfig(await getStore("assistant-config"));
}
async function readState() {
  return (await getStore("assistant-state")) || {};
}
async function writeState(patch) {
  const cur = await readState();
  await setStore("assistant-state", { ...cur, ...patch, updatedAt: new Date().toISOString() });
}

/**
 * Read and delete the JSON usage report `hermes --usage-file` leaves behind.
 * Returns null if it isn't there and can't be read via the docker fallback —
 * we warn once and carry on with NULL telemetry columns; a missing cost
 * number must never fail an otherwise-successful agent run.
 */
async function readUsage(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
    try { fs.unlinkSync(file); } catch { /* best effort */ }
  } catch {
    raw = await readUsageViaDocker(file);
  }
  if (raw == null) {
    if (!usageWarned) {
      usageWarned = true;
      log(`usage: no report at ${file} — telemetry columns will stay NULL. ` +
          `If HERMES_BIN is a docker wrapper, set BRIDGE_USAGE_DOCKER (+ prefix envs) ` +
          `so the bridge can read it via 'docker exec cat'.`);
    }
    return null;
  }
  try { return JSON.parse(raw); } catch { return null; }
}

/** Fallback read for when the host user can't traverse to `file` directly. */
async function readUsageViaDocker(file) {
  if (!USAGE_DOCKER || !USAGE_DOCKER_CTR_PFX || !file.startsWith(USAGE_DOCKER_HOST_PFX)) return null;
  const ctrPath = USAGE_DOCKER_CTR_PFX + file.slice(USAGE_DOCKER_HOST_PFX.length);
  try {
    const { stdout } = await execFileP("docker", ["exec", USAGE_DOCKER, "cat", ctrPath], { timeout: 10000 });
    await execFileP("docker", ["exec", USAGE_DOCKER, "rm", "-f", ctrPath]).catch(() => {});
    return stdout;
  } catch { return null; }
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

/** One-shot LLM call with --usage-file telemetry. The ONLY place a prompt is
 *  handed to the CLI — every kind that talks to a model routes through here so
 *  cost is never invisible (the bug briefing.generate still has). */
async function runPrompt({ id, profile, prompt, timeout = RUN_TIMEOUT_MS }) {
  try { fs.mkdirSync(USAGE_DIR, { recursive: true }); } catch { /* docker fallback */ }
  const usagePath = path.join(USAGE_DIR, `${id}.json`);
  const args = [...(profile ? ["--profile", profile] : []), "--usage-file", usagePath, "-z", prompt];
  const out = (await hermes(args, { timeout })).trim();
  return { out, usage: await readUsage(usagePath) };
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
      const rp = await runPrompt({ id: r.id, profile: r.profile, prompt: r.prompt || r.title });
      result = rp.out;
      usage = rp.usage;
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
    } else if (r.kind === "digest") {
      const cfg  = await readConfig();
      const slot = (() => { try { return JSON.parse(r.prompt || "{}").slot || "ondemand"; } catch { return "ondemand"; } })();
      const ctx  = await assistant.buildContext(q, { slot, windowH: 24, cfg });
      ctx.decisions = assistant.buildDecisions(ctx, cfg);
      let text = null, source = "llm";
      try {
        const { out, usage: u } = await runPrompt({ id: r.id, profile: DIGEST_PROFILE, prompt: assistant.DIGEST_PROMPT(ctx) });
        usage = u;                                   // telemetry lands on the row like any other run
        text  = assistant.formatDigest(out, ctx, slot);
      } catch (e) { log("digest llm failed:", e.message.split("\n")[0]); }
      if (!text) { text = assistant.renderFallback(ctx); source = "fallback"; }   // never skip (F-D3)
      const sent = await sendMessage(text);
      await setStore("assistant-decisions", { ts: new Date().toISOString(), items: ctx.decisions.slice(0, 12) });
      await assistant.logDigest(setStore, getStore, {
        ts: new Date().toISOString(), slot, ok: true, source,
        requestId: r.id, costUsd: usage?.estimated_cost_usd ?? null,
        decisions: ctx.decisions.length, sent, text,
      });
      result = `${source} · ${ctx.decisions.length} decisions · sent=${sent}`;
    } else if (r.kind === "report") {
      const cfg  = await readConfig();
      const ctx  = await assistant.buildContext(q, { slot: "ondemand", windowH: 24, cfg });
      ctx.decisions = assistant.buildDecisions(ctx, cfg);
      try {
        const { out, usage: u } = await runPrompt({ id: r.id, profile: r.profile, prompt: assistant.REPORT_PROMPT(ctx, r.profile, r.prompt || r.title) });
        usage = u;
        result = assistant.formatDigest(out, ctx, "ondemand") || assistant.renderFallback(ctx);
      } catch (e) {
        log("report llm failed:", e.message.split("\n")[0]);
        result = assistant.renderFallback(ctx);
      }
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
    if (r.profile && ["oneshot", "chat", "claude-code", "report"].includes(r.kind)) {
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
    // Spec G, G-4: a claude-code failure that reads as a rate limit is a
    // breadcrumb for the usage gauge, not just a failed row — never lets
    // this flip ccOnline (same isolation rule as G-D4; this only ever
    // touches the ccRateLimitNote module var that ccUsageTick() reads).
    if (r.kind === "claude-code" && CC_RATE_LIMIT_RE.test(msg)) {
      const win = ccRateLimitWindow(msg);
      ccRateLimitNote = `rate_limit at ${new Date().toISOString()} (${win})`;
      await emit("status", `Claude Code rate limit (${win})`, { level: "warn" });
    }
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
        const u = await readUsage(verdict.usagePath);
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
    ccWarned = false; ccOfflineSince = null;
    await writeState({ ccNudgeSentAt: null }); // F-5 rule 3 hardening: survives PM2 restart
  }
  if (!ccOnline && !ccWarned) {
    ccWarned = true;
    ccOfflineSince = ccOfflineSince ?? Date.now();
    log("cc: Mac unreachable — claude-code requests will hold (queued, not failed)");
  }
  if (!ccOnline && ccOfflineSince && Date.now() - ccOfflineSince > CC_OFFLINE_NUDGE_MIN * 60000) {
    const state = await readState();
    if (!state.ccNudgeSentAt) {
      const { rows } = await q(
        `SELECT COUNT(*)::int AS n FROM "AgentRequest" WHERE status = 'queued' AND kind = 'claude-code'`
      );
      const n = rows[0]?.n || 0;
      if (n > 0 && telegramEnabled()) {
        const ok = await sendMessage(`${n} tác vụ Claude Code đang chờ máy Mac online`);
        if (ok) await writeState({ ccNudgeSentAt: new Date().toISOString() }); // one nudge; doesn't repeat until reconnect resets the flag
      }
    }
  }

  await ccUsageTick();
}

/** "5h"/"7d" out of a short error/note string; defaults to the window we
 *  actually gauge (5h) when the text doesn't say which. */
function ccRateLimitWindow(text) {
  return /7d/i.test(String(text)) ? "7d" : "5h";
}

/**
 * Claude Code usage gauge (Spec G, G-D1/G-D5). Called ONLY from the tail of
 * ccReachabilityTick(), i.e. strictly after `ccOnline` has already been
 * assigned for this tick — every line below this point runs in its own
 * try/catch and can, at worst, leave `claude-usage` stale. It must never be
 * able to throw back into ccReachabilityTick and it must never assign to
 * `ccOnline` (G-D4). A cosmetic dashboard gauge is not allowed to take down
 * the Claude Code offload queue.
 */
async function ccUsageTick() {
  if (!ccEnabled()) return;
  const now = Date.now();
  if (now < ccUsageNextAttemptAt) return;
  if (now - ccUsageLastAttemptAt < CC_USAGE_THROTTLE_MS) return;
  ccUsageLastAttemptAt = now;
  ccUsageNextAttemptAt = now + CC_USAGE_THROTTLE_MS;

  try {
    let r = null;
    try {
      r = await ccUsageProbe();
    } catch (e) {
      log("cc-usage: probe threw —", e.message);
    }

    const prev = (await getStore("claude-usage")) || {};
    const { rows } = await q(
      `SELECT "costUsd", "createdAt" FROM "AgentRequest"
        WHERE kind='claude-code' AND "costUsd" IS NOT NULL
        ORDER BY "createdAt" DESC LIMIT 1`
    );
    const lastCostUsd = rows[0] ? Number(rows[0].costUsd) : (prev.lastCostUsd ?? null);
    const lastRunAt = rows[0] ? rows[0].createdAt.toISOString() : (prev.lastRunAt ?? null);

    let payload;
    if (r && Number.isFinite(r.pct)) {
      // A successful read. Clear the rate-limit breadcrumb once utilization
      // is well under 100 again (G-4) — a bar this low can't be why a run failed.
      if (r.pct < 90) ccRateLimitNote = null;
      payload = {
        fetchedAt: r.fetchedAt || new Date().toISOString(),
        source: "oauth-usage-api", // G-2's ground-truth correction: keychain OAuth API, not a sqlite cache
        parserV: Number.isFinite(r.parserV) ? r.parserV : 1,
        pct: r.pct,
        windowHours: r.windowHours ?? 5,
        resetsAt: r.resetsAt ?? null,
        lastCostUsd, lastRunAt,
        rawNote: ccRateLimitNote,
      };
      log(`cc-usage: read ok — pct=${r.pct} windowHours=${payload.windowHours}`);
    } else {
      // Transport failure (r.error) or the script's own failure (r.pct===null
      // + r.note) — either way this is a degraded payload: keep every prior
      // known number, never delete the key, never zero the percentage (G-D2).
      const reason = r?.error || r?.note || "usage probe returned nothing";
      log(`cc-usage: read failed — ${reason}`);
      if (r?.retryAfterS) {
        ccUsageNextAttemptAt = Math.max(ccUsageNextAttemptAt, now + r.retryAfterS * 1000);
        // A 429 from the usage API is itself a rate-limit event worth surfacing (G-4 step 6).
        ccRateLimitNote = `rate_limit at ${new Date().toISOString()} (${ccRateLimitWindow(reason)})`;
      }
      payload = {
        ...prev,
        pct: prev.pct ?? null,
        parserV: Number.isFinite(prev.parserV) ? prev.parserV : 1,
        source: "unavailable",
        rawNote: ccRateLimitNote ?? prev.rawNote ?? null,
        lastCostUsd, lastRunAt,
      };
    }

    const json = JSON.stringify(payload);
    const identical = json === ccUsageLastPayloadJson;
    if (!identical || now - ccUsageLastWriteAt >= CC_USAGE_WRITE_MIN_MS) {
      await setStore("claude-usage", payload);
      ccUsageLastPayloadJson = json;
      ccUsageLastWriteAt = now;
    }
  } catch (e) {
    log("cc-usage: tick failed —", e.message);
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

/**
 * Krisna scheduler (Spec F, F-4). Enqueues a `digest` AgentRequest when a
 * slot is due — the LLM call itself runs through the normal queue tick, not
 * here, so it rides claimBatch()'s SKIP LOCKED and sweepStale()'s timeout.
 *
 * Stamp-before-enqueue, deliberately: if the enqueue fails, we lose one
 * digest; if we stamped after and the process died between, we'd enqueue on
 * every 30s tick until it succeeded. A missed digest is recoverable (the
 * next slot, or the dashboard button); a Telegram flood at 30s intervals is
 * not.
 */
async function assistantTick() {
  const cfg = await readConfig();
  if (!cfg.enabled) return;
  const state = await readState();
  const due = assistant.slotDue(cfg, state, Date.now());
  if (due) {
    await writeState({ lastDigest: { ...state.lastDigest, [due.slot]: due.ictDate } });  // stamp FIRST
    if (due.late) {
      log(`assistant: skipping late ${due.slot} digest for ${due.ictDate}`);
    } else {
      await q(`INSERT INTO "AgentRequest"(id,origin,kind,title,prompt,status,"createdAt","updatedAt")
               VALUES ($1,'hermes','digest',$2,$3,'queued',now(),now())`,
              [randomUUID(), `Krisna · tóm tắt ${due.slot === "morning" ? "sáng" : "tối"}`,
               JSON.stringify({ slot: due.slot })]);
      await emit("status", `Krisna: ${due.slot} digest queued`, { level: "info" });
    }
  }
  await assistantNudges(cfg, state);
  if (ASSISTANT_TELEGRAM_INBOUND) {
    try { await assistantInboundTick(); } catch (e) { log("assistant inbound err", e.message); }
  }
}

const UNKNOWN_REPLY_COOLDOWN_MS = 5 * 60_000;

/**
 * Telegram inbound (Spec F, F-8) — `getUpdates` short-poll, no webhook and
 * therefore no new ingress (F-D8). The only action a message can trigger is
 * generating a digest, which is read-only.
 *
 * Three rules that make this safe to run against an open bot:
 *  1. Every message from a chat other than TELEGRAM_CHAT_ID is dropped
 *     silently — no reply (which would confirm the bot exists) and no log
 *     line carrying its text (an unknown sender's words must not land in
 *     our logs).
 *  2. `tgOffset` is persisted BEFORE acting. A crash mid-handling loses the
 *     command; replaying it would enqueue a duplicate digest on every restart.
 *  3. The unknown-command reply is rate-limited to one per 5 minutes, or a
 *     stray forwarded message starts a ping-pong.
 */
async function assistantInboundTick() {
  if (!telegramEnabled()) return;
  const state = await readState();
  const offset = Number(state.tgOffset) || 0;
  const updates = await getUpdates(offset);
  if (!updates.length) return;

  const maxId = Math.max(...updates.map((u) => Number(u.update_id) || 0));
  await writeState({ tgOffset: maxId + 1 });          // persist BEFORE acting (rule 2)

  const allowed = String(process.env.TELEGRAM_CHAT_ID || "");
  let enqueued = false;
  let unknown = false;

  for (const u of updates) {
    const msg = u.message;
    if (!msg || String(msg.chat?.id ?? "") !== allowed) continue;   // rule 1
    const text = String(msg.text || "").trim();
    if (!text) continue;

    if (assistant.REPORT_RE.test(text)) {
      if (enqueued) continue;                          // one digest per batch, not one per message
      await q(`INSERT INTO "AgentRequest"(id,origin,kind,title,prompt,status,"createdAt","updatedAt")
               VALUES ($1,'hermes','digest',$2,$3,'queued',now(),now())`,
              [randomUUID(), "Krisna · báo cáo (Telegram)", JSON.stringify({ slot: "ondemand" })]);
      await emit("status", "Krisna: digest queued (Telegram)", { level: "info" });
      log("assistant: telegram report request → digest queued");
      enqueued = true;
    } else {
      unknown = true;
    }
  }

  if (unknown && !enqueued) {
    const last = state.tgHelpAt ? Date.parse(state.tgHelpAt) : 0;
    if (!(Date.now() - last < UNKNOWN_REPLY_COOLDOWN_MS)) {          // rule 3
      const ok = await sendMessage('🪔 Krisna: gõ "báo cáo" để nhận tóm tắt.');
      if (ok) await writeState({ tgHelpAt: new Date().toISOString() });
    }
  }
}

const nudgeTrunc = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");

/** `[fromHHMM, toHHMM)`, wrapping midnight when `to <= from` (e.g. 22:30 → 07:00). */
function inQuietHours(nowMinutes, fromHHMM, toHHMM) {
  const [fh, fm] = fromHHMM.split(":").map(Number);
  const [th, tm] = toHHMM.split(":").map(Number);
  const from = fh * 60 + fm, to = th * 60 + tm;
  if (from === to) return false;
  return from < to ? nowMinutes >= from && nowMinutes < to : nowMinutes >= from || nowMinutes < to;
}

/**
 * Rule 1 (Spec F, F-5): one grouped nudge for every AgentRequest that has sat
 * `awaiting_approval` longer than `approvalStaleH` — never one message per
 * row, that is how a nudge becomes noise. Dedup + prune both live in
 * `state.approvalNudged`, keyed by request id; `sweepStale()` expires rows at
 * 24h so the map self-drains without an extra query.
 *
 * Returns the updated map, or null if nothing changed (caller skips the write).
 */
async function nudgeStaleApprovals(cfg, state) {
  const { rows } = await q(
    `SELECT r.id, r.title, r.profile, EXTRACT(EPOCH FROM (now()-r."createdAt"))/3600 AS "ageH",
            cl.slug, cl.name
       FROM "AgentRequest" r
       LEFT JOIN LATERAL (SELECT slug,name FROM "Client"
                           WHERE "hermesProfile"=r.profile OR slug=r.profile
                           ORDER BY ("hermesProfile"=r.profile) DESC LIMIT 1) cl ON true
      WHERE r.status='awaiting_approval'
      ORDER BY r."createdAt" ASC`
  );

  const priorNudged = state.approvalNudged || {};
  const stillAwaitingIds = new Set(rows.map((r) => r.id));
  const pruned = {};
  for (const id of Object.keys(priorNudged)) {
    if (stillAwaitingIds.has(id)) pruned[id] = priorNudged[id];
  }

  const stale = rows.filter((r) => Number(r.ageH) >= cfg.nudges.approvalStaleH).slice(0, 20);
  const fresh = stale.filter((r) => !pruned[r.id]);

  if (fresh.length) {
    const bullets = fresh.slice(0, 5).map(
      (r) => `• ${r.name || r.slug || r.profile || "?"} — ${nudgeTrunc(r.title, 80)} (${Math.round(Number(r.ageH))}h)`
    );
    const extra = fresh.length > 5 ? `\n+${fresh.length - 5} nữa` : "";
    const text = `🪔 Krisna nhắc: ${fresh.length} việc chờ duyệt >${cfg.nudges.approvalStaleH}h\n${bullets.join("\n")}${extra}\n\n${baseUrl()}/approvals`;
    const ok = await sendMessage(text);
    if (ok) {
      for (const r of fresh) pruned[r.id] = new Date().toISOString();
      await emit("status", `Krisna nhắc: ${fresh.length} duyệt chờ >${cfg.nudges.approvalStaleH}h`, { level: "warn" });
    }
  }

  return JSON.stringify(priorNudged) === JSON.stringify(pruned) ? null : pruned;
}

/**
 * Rule 2 (Spec F, F-5): `infra.mjs` reports host status but no outage
 * duration (§1.5) — that bookkeeping lives here in `state.infraDownSince`.
 * One nudge per outage (`infraNudged`); both keys clear on `status==='up'` so
 * the next outage nudges again. `degraded` neither arms nor clears.
 *
 * Returns `{infraDownSince, infraNudged}` if changed, else null.
 */
async function nudgeInfraDown(cfg, state) {
  const infraRaw = await getStore("infra-health");
  const hosts = Array.isArray(infraRaw?.hosts) ? infraRaw.hosts : [];
  const infraDownSince = { ...(state.infraDownSince || {}) };
  const infraNudged = { ...(state.infraNudged || {}) };
  let changed = false;

  for (const h of hosts) {
    if (h.status === "down") {
      if (!infraDownSince[h.host]) { infraDownSince[h.host] = new Date().toISOString(); changed = true; }
      const downMin = Math.round((Date.now() - Date.parse(infraDownSince[h.host])) / 60000);
      if (downMin >= cfg.nudges.infraDownMin && !infraNudged[h.host]) {
        const detail = h.lastError || h.detail;
        const text = `🪔 Krisna nhắc: ${h.host} offline ${downMin} phút${detail ? ` (${detail})` : ""}\n${baseUrl()}/infrastructure`;
        const ok = await sendMessage(text);
        if (ok) {
          infraNudged[h.host] = new Date().toISOString();
          changed = true;
          await emit("status", `Krisna nhắc: ${h.host} offline ${downMin} phút`, { level: "warn" });
        }
      }
    } else if (h.status === "up" && (infraDownSince[h.host] || infraNudged[h.host])) {
      delete infraDownSince[h.host];
      delete infraNudged[h.host];
      changed = true;
    }
    // degraded: neither arms nor clears (§F-5 step 4).
  }

  return changed ? { infraDownSince, infraNudged } : null;
}

/**
 * Nudges (Spec F, F-5) — separate from the digest check above so a bridge
 * with digests disabled still alerts on stale approvals/infra. Quiet hours
 * suppress nudges only; digests are exempt (Andy set those times himself).
 */
async function assistantNudges(cfg, state) {
  if (!cfg.nudges.enabled) return;
  const nowIct = assistant.ictNow();
  if (inQuietHours(nowIct.minutes, cfg.nudges.quietFromICT, cfg.nudges.quietToICT)) return;

  const patch = {};
  const approvalNudged = await nudgeStaleApprovals(cfg, state);
  if (approvalNudged) patch.approvalNudged = approvalNudged;
  const infraPatch = await nudgeInfraDown(cfg, state);
  if (infraPatch) Object.assign(patch, infraPatch);

  if (Object.keys(patch).length) await writeState(patch);
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
  try { await assistantTick(); } catch (e) { log("assistantTick err", e.message); }
  try { await writeTriageStats();} catch (e) { log("triageStats err", e.message); }
  await collectInfra().then((d) => setStore("infra-health", d)).catch((e) => log("infra err", e.message));
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
