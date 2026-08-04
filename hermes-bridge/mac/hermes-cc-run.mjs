#!/usr/bin/env node
/**
 * Hermes Claude Code runner — lives in the repo (reviewed, versioned), but
 * runs ONLY on the Mac. Never runs on the VPS: no `claude`, no repos there.
 *
 * Contract: one JSON object on stdin -> one JSON object on stdout.
 * Diagnostics go to stderr; stdout carries nothing but the final JSON.
 *
 *   in:  { "ping": true }
 *   in:  { "requestId": "...", "repo": "/abs/path", "model": "sonnet",
 *          "prompt": "...", "timeoutS": 900 }
 *
 *   out: { "ok": true,  "output": "...", "costUsd": 0.28, "tokensIn": 2,
 *          "tokensOut": 4, "cacheCreation": 28891, "cacheRead": 23909,
 *          "model": "claude-sonnet-5", "durationMs": 3048,
 *          "numTurns": 1, "branch": "hermes/cc-<id>", "worktree": "/path",
 *          "diffStat": "...", "patchPath": "/path/.hermes-cc.patch",
 *          "permissionDenials": 0 }
 *   out: { "ok": false, "error": "one line, <=600 chars", ...partial telemetry if any }
 *
 * Deployed to the Mac by hand (see mac/README.md) — a `git pull` on the VPS
 * does NOT update this file where it actually runs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = os.homedir();
const expandHome = (p) => (p && p.startsWith("~") ? path.join(HOME, p.slice(1)) : p);

const CC_CLAUDE_BIN = expandHome(process.env.CC_CLAUDE_BIN || "~/.local/bin/claude");
const CC_ALLOW_FILE = expandHome(process.env.CC_ALLOW_FILE || "~/.hermes/cc-repos.allow");
const CC_WORKTREE_ROOT = expandHome(process.env.CC_WORKTREE_ROOT || "~/.hermes/cc-worktrees");
const CC_WORKTREE_TTL_DAYS = Number(process.env.CC_WORKTREE_TTL_DAYS || 7);
const CC_DIFF_STAT_MAX = Number(process.env.CC_DIFF_STAT_MAX || 4000);
const CC_OUTPUT_MAX = Number(process.env.CC_OUTPUT_MAX || 200000);

const CC_MODELS = new Set(["fable", "opus", "sonnet"]);

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}
function fail(error, extra = {}) {
  out({ ok: false, error: String(error).slice(0, 600), ...extra });
}

function execFileCapture(bin, args, { cwd, input, maxBuffer = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    let child;
    try {
      child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String(e.message || e) });
      return;
    }
    child.stdout.on("data", (d) => { if (stdout.length < maxBuffer) stdout += d.toString(); });
    child.stderr.on("data", (d) => { if (stderr.length < 65536) stderr += d.toString(); });
    child.on("error", (e) => { if (!done) { done = true; resolve({ code: -1, stdout, stderr: String(e.message || e) }); } });
    child.on("close", (code) => { if (!done) { done = true; resolve({ code, stdout, stderr }); } });
    if (input != null) { child.stdin.end(input); } else { child.stdin.end(); }
  });
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const CAP = 256 * 1024;
    process.stdin.on("data", (d) => {
      total += d.length;
      if (total > CAP) { reject(new Error("stdin exceeds 256KB cap")); return; }
      chunks.push(d);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function readAllowlist() {
  let raw;
  try { raw = fs.readFileSync(CC_ALLOW_FILE, "utf8"); }
  catch { return null; } // missing ⇒ fail closed by caller
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => expandHome(l));
}

function validateRepo(repo) {
  let real;
  try { real = fs.realpathSync(repo); }
  catch { return { ok: false, error: `repo does not exist: ${repo}` }; }

  const root = fs.realpathSync("/");
  const home = fs.realpathSync(HOME);
  if (real === root || real === home) {
    return { ok: false, error: `repo may not be / or $HOME: ${real}` };
  }

  const allow = readAllowlist();
  if (allow === null) {
    return { ok: false, error: `missing allow file: ${CC_ALLOW_FILE}` };
  }
  const allowed = allow.some((entry) => {
    let entryReal;
    try { entryReal = fs.realpathSync(entry); } catch { return false; }
    return real === entryReal || real.startsWith(entryReal + path.sep);
  });
  if (!allowed) {
    return { ok: false, error: `repo not in ${CC_ALLOW_FILE}: ${repo}` };
  }

  if (!fs.existsSync(path.join(real, ".git"))) {
    return { ok: false, error: "not a git repository — refusing (Spec E, E15)" };
  }
  return { ok: true, real };
}

async function pruneWorktrees(repo) {
  try {
    if (!fs.existsSync(CC_WORKTREE_ROOT)) return;
    const now = Date.now();
    const ttlMs = CC_WORKTREE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(CC_WORKTREE_ROOT, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(CC_WORKTREE_ROOT, ent.name);
      let stat;
      try { stat = fs.statSync(dir); } catch { continue; }
      if (now - stat.mtimeMs <= ttlMs) continue;
      try { await execFileCapture("git", ["-C", repo, "worktree", "remove", "--force", dir]); } catch { /* best effort */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  } catch { /* pruning must never fail a run */ }
}

async function main() {
  let raw;
  try { raw = await readStdin(); } catch (e) { fail(`bad stdin: ${e.message}`); return; }

  let payload;
  try { payload = JSON.parse(raw); } catch { fail("bad stdin JSON"); return; }

  if (payload && payload.ping === true) {
    let version = "";
    const r = await execFileCapture(CC_CLAUDE_BIN, ["--version"]);
    version = (r.stdout || r.stderr || "").trim().split("\n")[0];
    out({ ok: true, ping: "pong", claude: version, node: process.version });
    return;
  }

  const { requestId, repo, model, prompt, timeoutS } = payload || {};

  if (!CC_MODELS.has(model)) { fail(`model must be one of fable|opus|sonnet, got: ${model}`); return; }
  if (typeof prompt !== "string" || !prompt.length || prompt.length > 100 * 1024) {
    fail("prompt must be a non-empty string <= 100KB"); return;
  }
  if (typeof repo !== "string" || !repo) { fail("repo is required"); return; }

  const repoCheck = validateRepo(repo);
  if (!repoCheck.ok) { fail(repoCheck.error); return; }
  const repoReal = repoCheck.real;

  await pruneWorktrees(repoReal);

  const reqId = requestId || `adhoc-${Date.now()}`;
  const worktree = path.join(CC_WORKTREE_ROOT, reqId);
  const branch = `hermes/cc-${reqId}`;

  fs.mkdirSync(CC_WORKTREE_ROOT, { recursive: true });
  const addResult = await execFileCapture("git", ["-C", repoReal, "worktree", "add", worktree, "-b", branch]);
  if (addResult.code !== 0) {
    const firstLine = (addResult.stderr || "git worktree add failed").split("\n")[0];
    fail(firstLine);
    return;
  }

  const deadlineS = Number.isFinite(timeoutS) && timeoutS > 0 ? timeoutS : 900;
  const args = [
    "-p", "--output-format", "json", "--model", model,
    "--permission-mode", "acceptEdits",
    "--strict-mcp-config", "--setting-sources", "project",
  ];

  const t0 = Date.now();
  const runResult = await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(CC_CLAUDE_BIN, args, { cwd: worktree, stdio: ["pipe", "pipe", "pipe"] });
    const killer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, deadlineS * 1000);
    child.stdout.on("data", (d) => { if (stdout.length < CC_OUTPUT_MAX) stdout += d.toString(); });
    child.stderr.on("data", (d) => { if (stderr.length < 65536) stderr += d.toString(); });
    child.on("error", (e) => {
      if (settled) return; settled = true; clearTimeout(killer);
      resolve({ code: -1, stdout, stderr: String(e.message || e) });
    });
    child.on("close", (code) => {
      if (settled) return; settled = true; clearTimeout(killer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(prompt);
  });
  const durationMsWall = Date.now() - t0;

  let parsed = null;
  try { parsed = JSON.parse(runResult.stdout); } catch { /* handled below */ }

  const diffCapture = await captureDiff(repoReal, worktree);

  if (!parsed) {
    const raw = runResult.stderr || runResult.stdout;
    const firstLine = raw
      ? `${raw.split("\n")[0]} (claude returned no JSON)`
      : "claude produced no parseable output";
    fail(firstLine.slice(0, 600), {
      branch, worktree,
      diffStat: diffCapture.diffStat,
      patchPath: diffCapture.patchPath,
      durationMs: durationMsWall,
    });
    return;
  }

  const modelUsageKeys = parsed.modelUsage ? Object.keys(parsed.modelUsage) : [];
  const resolvedModel = modelUsageKeys[0] || model;

  // Cache tokens are the actual Claude Code workload (routinely 10-100x input/output);
  // total_cost_usd is Anthropic's own figure and already prices cache-write vs cache-read
  // correctly — never derive a cost from token counts (Spec G, G-D3).
  const usage = parsed.usage || {};
  const cacheCreationRaw = usage.cache_creation_input_tokens ?? usage.cache_creation ?? null;
  const cacheReadRaw = usage.cache_read_input_tokens ?? usage.cache_read ?? null;

  const telemetry = {
    output: typeof parsed.result === "string" ? parsed.result.slice(0, CC_OUTPUT_MAX) : "",
    costUsd: Number.isFinite(parsed.total_cost_usd) ? parsed.total_cost_usd : null,
    tokensIn: Number.isFinite(usage.input_tokens) ? usage.input_tokens : null,
    tokensOut: Number.isFinite(usage.output_tokens) ? usage.output_tokens : null,
    cacheCreation: Number.isFinite(cacheCreationRaw) ? cacheCreationRaw : null,
    cacheRead: Number.isFinite(cacheReadRaw) ? cacheReadRaw : null,
    model: resolvedModel,
    durationMs: Number.isFinite(parsed.duration_ms) ? parsed.duration_ms : durationMsWall,
    numTurns: Number.isFinite(parsed.num_turns) ? parsed.num_turns : null,
    branch,
    worktree,
    diffStat: diffCapture.diffStat,
    patchPath: diffCapture.patchPath,
    permissionDenials: Array.isArray(parsed.permission_denials) ? parsed.permission_denials.length : 0,
  };

  if (parsed.is_error === true) {
    // Claude Code's `subtype` is meant to describe the failure (e.g. "error_max_turns"),
    // but on some errors (e.g. api_error / unknown model) it stays "success" while
    // `result` carries the actual human-readable message — prefer that when subtype lies.
    const resultMsg = typeof parsed.result === "string" ? parsed.result.trim() : "";
    const subtype = parsed.subtype;
    const errorMsg = subtype && subtype !== "success"
      ? subtype
      : (resultMsg || subtype || "claude reported is_error");
    fail(errorMsg, telemetry);
    return;
  }

  out({ ok: true, ...telemetry });
}

/** git add -A, then diff --cached --stat (truncated) + the full patch to disk.
 *  Never commit, never push (E15/E16). Empty diff ⇒ diffStat "", no patch file. */
async function captureDiff(repoReal, worktree) {
  await execFileCapture("git", ["-C", worktree, "add", "-A"]);
  const statResult = await execFileCapture("git", ["-C", worktree, "diff", "--cached", "--stat"]);
  const diffStat = (statResult.stdout || "").trim().slice(0, CC_DIFF_STAT_MAX);
  if (!diffStat) return { diffStat: "", patchPath: null };

  const patchResult = await execFileCapture("git", ["-C", worktree, "diff", "--cached"]);
  const patchPath = path.join(worktree, ".hermes-cc.patch");
  try { fs.writeFileSync(patchPath, patchResult.stdout || ""); } catch { return { diffStat, patchPath: null }; }
  return { diffStat, patchPath };
}

main().catch((e) => fail(`unhandled: ${e.message || e}`));
