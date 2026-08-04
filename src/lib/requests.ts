/**
 * One source of truth for AgentRequest status vocabulary and the pre-flight
 * side-effect net. Adding a status here is the only edit needed for every
 * surface that renders one (Spec D, D17).
 */

export const REQUEST_STATUSES = [
  "queued", "awaiting_approval", "approved", "running",
  "done", "failed", "rejected", "expired",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  queued: "Queued",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  running: "Running",
  done: "Done",
  failed: "Failed",
  rejected: "Rejected",
  expired: "Expired",
};

export type Tone = "neutral" | "up" | "down" | "warn" | "accent";
export const STATUS_TONE: Record<RequestStatus, Tone> = {
  queued: "neutral",
  awaiting_approval: "warn",
  approved: "accent",
  running: "accent",
  done: "up",
  failed: "down",
  rejected: "neutral",
  expired: "neutral",
};

/** Nothing will ever move a request out of these. */
export const TERMINAL = new Set<string>(["done", "failed", "rejected", "expired"]);
/** The thread keeps polling while a request is in one of these. */
export const POLLING = new Set<string>(["queued", "approved", "running", "awaiting_approval"]);
/** …but "Hermes is typing" is only honest for these (D18). */
export const PENDING = new Set<string>(["queued", "approved", "running"]);
/** A re-run may only be spawned from these. */
export const RERUNNABLE = new Set<string>(["expired", "failed", "rejected"]);

export const isStatus = (s: string): s is RequestStatus =>
  (REQUEST_STATUSES as readonly string[]).includes(s);

/* ── Pre-flight side-effect net (D2) ─────────────────────────────
 * Deliberately HIGH PRECISION, LOW RECALL. Every rule here is
 * destructive, irreversible, or reaches a third party. Recall is the
 * operator's job via the ⚡ Hành động mode — a false positive costs one
 * tap, a false negative costs a production deploy.
 *
 * Explicitly NOT included: bare "send"/"gửi", "update", "change", "write",
 * "cập nhật" — all overwhelmingly benign in this app's chat traffic.
 *
 * PHASE 3 SEAM: replace this function body with the triage-skill call.
 * Its signature and the flagReason contract stay identical.
 */
const FLAG_RULES: { re: RegExp; label: string }[] = [
  { re: /\brm\s+-rf\b|\bdrop\s+(table|database)\b|\btruncate\b/i, label: "destructive SQL/shell" },
  { re: /\bdelete\b|\bxo[áa]\b|\bhu[ỷy]\b/i,                       label: "delete" },
  { re: /\bdeploy\b|\btri[ểe]n khai\b|\bship to prod/i,            label: "deploy" },
  { re: /\bforce[- ]push\b|\bpush to (main|master|prod)/i,         label: "force push" },
  { re: /\bpublish\b|\b[đd]ăng b[àa]i\b|\bgo live\b/i,             label: "publish" },
  { re: /\bsend (an? )?(email|mail|invoice|dm)\b|\bg[ửu]i (email|mail|h[óo]a [đd]ơn)\b/i, label: "send email" },
  { re: /\brefund\b|\bho[àa]n ti[ềe]n\b|\bchuy[ểe]n ti[ềe]n\b|\bcharge (the )?card\b/i,   label: "money movement" },
  { re: /\brestart\b|\bshutdown\b|\bkh[ởo]i [đd]ộng l[ạa]i\b/i,    label: "restart service" },
  { re: /\bmigrat(e|ion)\b|\bdb push\b/i,                          label: "migration" },
  { re: /\brevoke\b|\brotate (the )?(key|token|secret)\b/i,        label: "credential change" },
];

/**
 * Escalate-only. Returns a rule label when the text looks side-effecting,
 * else null. NEVER call this to downgrade an explicit operator choice.
 */
export function detectSideEffect(text: string): string | null {
  for (const r of FLAG_RULES) if (r.re.test(text)) return r.label;
  return null;
}

/* ── Kind vocabulary (Spec E, E21) ───────────────────────────────
 * `kind` is a free string in the DB, not an enum — cron.* is a family.
 * These constants exist so the UI never string-matches 'claude-code'
 * in five places. */
export const KIND_CLAUDE_CODE = "claude-code";

/** Model aliases the triage classifier may choose. Anything else ⇒ sonnet. */
export const CC_MODELS = ["fable", "opus", "sonnet"] as const;
export type CcModel = (typeof CC_MODELS)[number];
export const isCcModel = (m: unknown): m is CcModel =>
  (CC_MODELS as readonly string[]).includes(String(m));

/** Human label for a chip. Falls back to the raw kind — an unknown kind
 *  should read as itself, never as blank. */
export function kindLabel(kind: string): string {
  if (kind === KIND_CLAUDE_CODE) return "Claude Code";
  if (kind.startsWith("cron.")) return `Cron · ${kind.slice(5)}`;
  return kind;
}
