/* ───────────────────────────────────────────────────────────
   Spec H · cockpit section registry.
   The single source of truth for what can be dragged on `/`
   and in what order it renders by default. Imported by BOTH
   src/app/page.tsx (client) and src/app/api/dashboard-layout/route.ts
   (server), so the server validates against the exact list the UI
   renders from — a stale or hand-edited DataStore row can never
   wedge the dashboard.
   ─────────────────────────────────────────────────────────── */

export type DashboardSectionId =
  | "status-strip"
  | "throughput"
  | "briefing"
  | "assistant"
  | "projects"
  | "infra"
  | "activity"
  | "claude-usage"
  | "infra-health";

/**
 * The pre-Spec-H render order of src/app/page.tsx:346-367, with one deliberate
 * change: Andy asked (2026-08-05, after the spec was written) for the Claude
 * usage box to sit right after the four main cockpit panels instead of near the
 * bottom — so "claude-usage" is 5th, ahead of projects/infra/activity/
 * infra-health. Every other entry keeps its original relative position.
 */
export const DEFAULT_DASHBOARD_ORDER: DashboardSectionId[] = [
  "status-strip",
  "throughput",
  "briefing",
  "assistant",
  "claude-usage",
  "projects",
  "infra",
  "activity",
  "infra-health",
];

const KNOWN = new Set<string>(DEFAULT_DASHBOARD_ORDER);

export const DASHBOARD_LAYOUT_KEY = "dashboard-layout";

/** Total function (D9). Any input — null, {}, a string, a partial array, an
 *  array with duplicates or ids from a future/past release — yields a complete,
 *  deduped, valid order. Never throws.
 *    · unknown id            → dropped (section deleted in a later release)
 *    · duplicate             → first occurrence wins
 *    · missing id            → appended in DEFAULT order (a section ADDED in a
 *                              later release surfaces at the bottom instead of
 *                              silently disappearing) */
export function normalizeDashboardOrder(raw: unknown): DashboardSectionId[] {
  const seen = new Set<string>();
  const out: DashboardSectionId[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v !== "string" || !KNOWN.has(v) || seen.has(v)) continue;
      seen.add(v);
      out.push(v as DashboardSectionId);
    }
  }
  for (const id of DEFAULT_DASHBOARD_ORDER) if (!seen.has(id)) out.push(id);
  return out;
}
