/**
 * Krisna 🪔 — shared client/server bits for the web app (Spec F, F-7 step 1).
 *
 * Twin: hermes-bridge/assistant.mjs carries the same DEFAULT_CONFIG /
 * normalizeConfig for the bridge. Deliberately duplicated rather than shared
 * — the bridge is a separate CJS/ESM package with no path alias into src/,
 * and this is ~40 lines. Keep the two clamps in sync by hand (Spec F risk #6).
 */

export const ASSISTANT_NAME = "Krisna";
export const ASSISTANT_EMOJI = "🪔";

export interface AssistantConfig {
  enabled: boolean;
  name: string;
  digest: {
    morning: string | null;
    evening: string | null;
    tzOffsetMin: number;
    catchupMin: number;
  };
  nudges: {
    enabled: boolean;
    approvalStaleH: number;
    infraDownMin: number;
    ccOfflineMin: number | null;
    quietFromICT: string;
    quietToICT: string;
  };
  clients: Record<string, { muted?: boolean }>;
}

export const DEFAULT_CONFIG: AssistantConfig = {
  enabled: true,
  name: ASSISTANT_NAME,
  digest: {
    morning: "07:30",
    evening: "21:00",
    tzOffsetMin: 420, // ICT = UTC+7, no DST (Spec F risk #5)
    catchupMin: 180,
  },
  nudges: {
    enabled: true,
    // Spec's own table default is 2h; Spec F risk #1 overrides it to 4h —
    // "ship humane for a solo operator", tune down later if things are missed.
    approvalStaleH: 4,
    infraDownMin: 30,
    ccOfflineMin: 30,
    quietFromICT: "22:30",
    quietToICT: "07:00",
  },
  clients: {},
};

const TIME_RE = /^\d{2}:\d{2}$/;

function clampNum(v: unknown, def: number, lo: number, hi: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

/** Format AND range check — /^\d{2}:\d{2}$/ alone accepts "99:99". */
function isValidHHMM(v: unknown): v is string {
  if (typeof v !== "string" || !TIME_RE.test(v)) return false;
  const [h, m] = v.split(":").map(Number);
  return h <= 23 && m <= 59;
}

/** null is a valid "disable this slot" value; anything else must match HH:MM. */
function normTimeOrNull(v: unknown, def: string | null): string | null {
  if (v === null) return null;
  return isValidHHMM(v) ? v : def;
}

/** Quiet-hours bounds are never optional — invalid/missing falls back to default. */
function normTimeReq(v: unknown, def: string): string {
  return isValidHHMM(v) ? v : def;
}

/**
 * Deep-merge over DEFAULT_CONFIG and clamp every number. Never throws — a
 * hand-edited DataStore row (or a malformed PUT body) must not crash the route.
 */
export function normalizeConfig(raw: unknown): AssistantConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rd = (r.digest && typeof r.digest === "object" ? r.digest : {}) as Record<string, unknown>;
  const rn = (r.nudges && typeof r.nudges === "object" ? r.nudges : {}) as Record<string, unknown>;
  const rc = (r.clients && typeof r.clients === "object" ? r.clients : {}) as Record<string, { muted?: boolean }>;

  return {
    enabled: r.enabled !== undefined ? Boolean(r.enabled) : DEFAULT_CONFIG.enabled,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : DEFAULT_CONFIG.name,
    digest: {
      morning: normTimeOrNull(rd.morning, DEFAULT_CONFIG.digest.morning),
      evening: normTimeOrNull(rd.evening, DEFAULT_CONFIG.digest.evening),
      tzOffsetMin: Number.isFinite(Number(rd.tzOffsetMin)) ? Number(rd.tzOffsetMin) : DEFAULT_CONFIG.digest.tzOffsetMin,
      catchupMin: clampNum(rd.catchupMin, DEFAULT_CONFIG.digest.catchupMin, 15, 720),
    },
    nudges: {
      enabled: rn.enabled !== undefined ? Boolean(rn.enabled) : DEFAULT_CONFIG.nudges.enabled,
      approvalStaleH: clampNum(rn.approvalStaleH, DEFAULT_CONFIG.nudges.approvalStaleH, 1, 23),
      infraDownMin: clampNum(rn.infraDownMin, DEFAULT_CONFIG.nudges.infraDownMin, 5, 720),
      // null is deliberate: "env (CC_OFFLINE_NUDGE_MIN) wins" (§4/§8).
      ccOfflineMin: rn.ccOfflineMin === null ? null : clampNum(rn.ccOfflineMin, DEFAULT_CONFIG.nudges.ccOfflineMin ?? 30, 5, 720),
      quietFromICT: normTimeReq(rn.quietFromICT, DEFAULT_CONFIG.nudges.quietFromICT),
      quietToICT: normTimeReq(rn.quietToICT, DEFAULT_CONFIG.nudges.quietToICT),
    },
    clients: rc,
  };
}

/**
 * A report is a read-only summary of one client's 24h — never triaged (no
 * LLM classification cost), never side-effecting, answered in-thread by the
 * bridge. Anchored at the start so "viết báo cáo cho khách hàng vào file X"
 * (an engineering task) is not swallowed (Spec F, F-7 step 4).
 */
export const REPORT_RE = /^\s*(báo\s*cáo|tình hình|summary|report|status)\b/i;
