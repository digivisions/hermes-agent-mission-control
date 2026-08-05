#!/usr/bin/env node
/**
 * Hermes Claude Code usage reader — lives in the repo (reviewed, versioned),
 * runs ONLY on the Mac, invoked over the same SSH session `ccProbe({ping:true})`
 * already opens (Spec G, G-D1). No stdin. Prints one JSON object to stdout,
 * always exits 0 — a usage-read failure must never look like an SSH failure
 * to the caller (Spec G, G-D4).
 *
 * Ground-truth correction vs the original spec draft: there is no local
 * SQLite usage cache on this Mac (exhaustively searched — none exists under
 * ~/.claude or ~/Library/Application Support/Claude). The real source,
 * confirmed working and already in production use here via the installed
 * `claude-hud` plugin (see its usage-api.ts under
 * ~/.claude/plugins/cache/claude-hud, one dir per installed version), is:
 *   1. Read the OAuth access token from the macOS Keychain
 *      (`security find-generic-password -s "Claude Code-credentials" -w`),
 *      falling back to the legacy `~/.claude/.credentials.json` file.
 *   2. GET https://api.anthropic.com/api/oauth/usage with that token
 *      (read-only — never refreshes or rotates the token; G-R2).
 *   3. The response's `five_hour.{utilization,resets_at}` is the same
 *      qualified field the spec's ground-truth section named — just reached
 *      via the API, not a cache file.
 *
 *   out (success): { "pct": 37, "windowHours": 5, "resetsAt": "...",
 *                     "parserV": 1, "fetchedAt": "...", "tokenSource": "..." }
 *   out (failure):  { "pct": null, "parserV": 1, "note": "<=80 chars",
 *                      "retryAfterS": 120,      // 429 backoff, or 401 backoff
 *                      "rateLimited": true,     // 429 only
 *                      "authStale": true }      // 401 only — token no longer valid
 *
 * 2026-08-05 root cause (the card never once showed a real number): the macOS
 * login keychain holds TWO generic-password items under the service
 * "Claude Code-credentials" — an old one with acct="Claude Code" (written by a
 * January build of Claude Code, never touched since) and the live one with
 * acct=<unix username>, which current Claude Code rewrites on every token
 * refresh. `security find-generic-password -s <service> -w` returns whichever
 * it finds FIRST, which here is the January item — a six-month-dead access
 * token. Every usage read was therefore made with a token the API rejects
 * (401 "Invalid authentication credentials", confirmed against
 * /api/oauth/profile). The lookup below is account-aware and ranks every
 * candidate by expiry, so it lands on the live item.
 *
 * Deployed to the Mac by hand (see mac/README.md) — a `git pull` on the VPS
 * does NOT update this file where it actually runs.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";

const HOME = os.homedir();
const expandHome = (p) => (p && p.startsWith("~") ? path.join(HOME, p.slice(1)) : p);

const PARSER_V = 1;
const STATE_FILE = expandHome(process.env.CC_USAGE_STATE_FILE || "~/.hermes/state/cc-usage.json");
const THROTTLE_FLOOR_MS = 15 * 60 * 1000;
const THROTTLE_MS = Math.max(
  THROTTLE_FLOOR_MS,
  Number(process.env.CC_USAGE_THROTTLE_MS) || 20 * 60 * 1000
);
const KEYCHAIN_TIMEOUT_MS = 5000;
const API_TIMEOUT_MS = 6000;
const CREDENTIALS_FILE = expandHome("~/.claude/.credentials.json");
const TOKEN_EXPORT_FILE = expandHome("~/.hermes/state/cc-oauth-token");
const KEYCHAIN_SERVICE = "Claude Code-credentials";
/** Current Claude Code stores the live item under the unix username. */
const KEYCHAIN_ACCOUNT = os.userInfo().username;
/** Older builds used a literal "Claude Code" account — still present, now dead. */
const KEYCHAIN_LEGACY_ACCOUNT = "Claude Code";
/** A 401 means "no usable token here", which no amount of retrying at the
 *  normal 20min cadence fixes — only Claude Code refreshing does. Ask the
 *  bridge for a longer nap, short enough to recover on its own within the hour. */
const AUTH_STALE_BACKOFF_S = 1800;

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function fail(note, extra = {}) {
  out({ pct: null, parserV: PARSER_V, note: String(note).slice(0, 80), ...extra });
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.fetchedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeState(payload) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload));
  } catch {
    /* throttle cache is best-effort; a write failure must not fail the run */
  }
}

/**
 * Never print the raw keychain blob — parse it, return only the token + expiry.
 * `account` disambiguates the duplicate items described in the header comment;
 * null means "no -a filter", i.e. the legacy first-match lookup, kept last as a
 * fallback for machines that only ever had the one item.
 */
function readKeychainToken(account) {
  const args = ["find-generic-password"];
  if (account) args.push("-a", account);
  args.push("-s", KEYCHAIN_SERVICE, "-w");
  let raw;
  try {
    raw = execFileSync("/usr/bin/security", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: KEYCHAIN_TIMEOUT_MS,
    }).trim();
  } catch {
    return null;
  }
  if (!raw) return null;
  return parseOauthBlob(raw);
}

/** Reads a Claude OAuth JSON blob (keychain blob or exported token file) for its access token. */
function parseOauthBlob(raw) {
  try {
    const data = JSON.parse(raw);
    const accessToken = data?.claudeAiOauth?.accessToken;
    const expiresAt = data?.claudeAiOauth?.expiresAt;
    if (!accessToken) return null;
    return { accessToken, expiresAt: Number.isFinite(expiresAt) ? expiresAt : null };
  } catch {
    return null;
  }
}

/**
 * Token exported by the LaunchAgent (com.hermes.cc-token-export): keychain is
 * GUI-session-only, so a scheduled job copies the token to a 0600 file the
 * VPS->Mac SSH session CAN read. This is the FIRST source.
 */
function readTokenExportFile() {
  let raw;
  try {
    raw = fs.readFileSync(TOKEN_EXPORT_FILE, "utf8");
  } catch {
    return null;
  }
  return parseOauthBlob(raw);
}

/** Legacy fallback for older Claude Code versions that never used the Keychain. */
function readFileToken() {
  let raw;
  try {
    raw = fs.readFileSync(CREDENTIALS_FILE, "utf8");
  } catch {
    return null;
  }
  return parseOauthBlob(raw);
}

/**
 * Every place a Claude OAuth token can live on this Mac, in fallback order:
 * the LaunchAgent's export file first (the ONLY one readable from the VPS's
 * non-GUI SSH session), then each keychain item, then the legacy file.
 *
 * The list is then re-ranked by `expiresAt`: a candidate whose expiry is still
 * in the future outranks one that is already past, and among those the latest
 * expiry wins. Ranking only — nothing is ever *rejected* for a stale
 * `expiresAt`, because that metadata has been observed to lie in both
 * directions (G-R3); if every candidate looks expired we still try them, best
 * first. Duplicates (the export file is normally a copy of a keychain item)
 * collapse to one entry so the 401 retry below always tries a NEW token.
 */
function collectTokenCandidates() {
  const raw = [
    ["export-file", readTokenExportFile()],
    [`keychain(${KEYCHAIN_ACCOUNT})`, readKeychainToken(KEYCHAIN_ACCOUNT)],
    ["keychain(legacy-acct)", readKeychainToken(KEYCHAIN_LEGACY_ACCOUNT)],
    ["keychain(first-match)", readKeychainToken(null)],
    ["legacy-file", readFileToken()],
  ];

  const seen = new Set();
  const candidates = [];
  raw.forEach(([source, parsed], order) => {
    if (!parsed?.accessToken || seen.has(parsed.accessToken)) return;
    seen.add(parsed.accessToken);
    candidates.push({ ...parsed, source, order });
  });

  const now = Date.now();
  const live = (c) => (c.expiresAt != null && c.expiresAt > now ? 1 : 0);
  return candidates.sort((a, b) => {
    if (live(a) !== live(b)) return live(b) - live(a);
    if (live(a) === 1) return (b.expiresAt ?? 0) - (a.expiresAt ?? 0);
    return a.order - b.order;
  });
}

function fetchUsage(accessToken) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "anthropic-beta": "oauth-2025-04-20",
          "User-Agent": "hermes-cc-usage/1.0",
        },
        timeout: API_TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.on("data", (d) => { body += d; });
        res.on("end", () => {
          if (res.statusCode === 429) {
            const retryAfterS = Number(res.headers["retry-after"]) || 300;
            resolve({ error: `api http-429`, retryAfterS, rateLimited: true });
            return;
          }
          if (res.statusCode === 401 || res.statusCode === 403) {
            // Distinct from a 429 on purpose: nothing here is rate-limited, the
            // token is simply not accepted any more. Surfaced as its own state
            // so the card can say so instead of showing an hours-old
            // "rate_limit" breadcrumb (Spec G regression, 2026-08-05).
            resolve({
              error: `api http-${res.statusCode}`,
              authStale: true,
              retryAfterS: AUTH_STALE_BACKOFF_S,
            });
            return;
          }
          if (res.statusCode !== 200) {
            resolve({ error: `api http-${res.statusCode}` });
            return;
          }
          try {
            resolve({ data: JSON.parse(body) });
          } catch {
            resolve({ error: "api parse error" });
          }
        });
      }
    );
    req.on("error", () => resolve({ error: "api network error" }));
    req.on("timeout", () => { req.destroy(); resolve({ error: "api timeout" }); });
    req.end();
  });
}

function clampPct(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(Math.max(0, Math.min(100, v)));
}

async function main() {
  const cached = readState();
  if (cached) {
    const age = Date.now() - Date.parse(cached.fetchedAt);
    if (Number.isFinite(age) && age >= 0 && age < THROTTLE_MS) {
      out(cached);
      return;
    }
  }

  const candidates = collectTokenCandidates();
  if (!candidates.length) {
    fail("no credentials found (keychain + file)");
    return;
  }

  // Deliberately not gating on the stored expiresAt: Claude Code's own CLI
  // keeps working long after this metadata claims expiry (it refreshes
  // in-memory without always rewriting Keychain), so a local expiresAt
  // check is unreliable in either direction. Trust the API's own response
  // instead of local metadata (G-R3 — never guess).
  //
  // On a 401 we walk to the next distinct candidate rather than giving up:
  // that is the auto-recovery path for a stale export file whose keychain
  // source has since been refreshed. In the VPS's SSH session the keychain is
  // unreadable, so there IS only one candidate and this loop runs once.
  let result = null;
  let token = null;
  for (const candidate of candidates) {
    token = candidate;
    result = await fetchUsage(candidate.accessToken);
    if (!result.authStale) break;
  }
  if (!result.data) {
    const extra = {};
    if (result.retryAfterS) extra.retryAfterS = result.retryAfterS;
    if (result.rateLimited) extra.rateLimited = true;
    if (result.authStale) extra.authStale = true;
    fail(result.error || "api unavailable", extra);
    return;
  }

  const fiveHour = result.data.five_hour || {};
  const pct = clampPct(fiveHour.utilization);
  const resetsAt =
    typeof fiveHour.resets_at === "string" && !Number.isNaN(Date.parse(fiveHour.resets_at))
      ? fiveHour.resets_at
      : null;

  if (pct == null) {
    fail("five_hour.utilization missing or unparsable — schema may have changed");
    return;
  }

  const payload = {
    pct,
    windowHours: 5,
    resetsAt,
    parserV: PARSER_V,
    fetchedAt: new Date().toISOString(),
    tokenSource: token.source, // which credential worked — for bridge logs only
  };
  writeState(payload);
  out(payload);
}

main().catch((e) => fail(`unhandled: ${String(e?.message || e).slice(0, 60)}`));
