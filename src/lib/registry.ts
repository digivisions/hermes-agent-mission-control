/**
 * Shared vocabulary + validation for the two registries (Client, Project).
 * They are separate models on purpose (Spec C, D3); this file is the only
 * thing they share, so their slug rules and error shapes can't drift.
 */

/** Lowercase, digit- or letter-initial, 2-48 chars. Matches every seeded slug. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

export const CLIENT_STATUSES = ["active", "unconfigured", "archived"] as const;
export const CLIENT_TYPES = ["ecommerce", "webapp", "internal", "edtech", "agency"] as const;

export const PROJECT_STATUSES = [
  "active", "ongoing", "paused", "planned", "blocked", "complete", "archived",
] as const;
export const PROJECT_TYPES = ["internal", "product", "infra", "client-site", "personal"] as const;
export const PRIORITIES = ["high", "medium", "low"] as const;

/** #rgb or #rrggbb, or null to clear. */
export const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export type Fail = { field: string; message: string };

/** Copies only `keys` from `body`, skipping absent ones. PATCH semantics: a
 *  key that isn't present is untouched; a key present as null is cleared. */
export function pick<T extends object>(body: Record<string, unknown>, keys: readonly (keyof T & string)[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out as Partial<T>;
}

/** Trim strings, coerce "" → null for nullable text fields. */
export function normText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Accepts string[] or a newline/comma-separated string. Always returns string[]. */
export function normList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export function badRequest(errors: Fail[]) {
  return Response.json({ error: "invalid", errors }, { status: 400 });
}

export type DocRef = { title: string; url?: string; note?: string };

/** A link or a local/network file path — not an arbitrary string, since this
 *  is a reference to an external record, not free text. */
const DOC_URL_RE = /^(https?:\/\/|\/|[a-zA-Z]:[\\/]|~\/|\.\/|\.\.\/)/;

/** Validates the `documents` field on Client/Project PATCH bodies:
 *  [{ title, url?, note? }]. Returns null (clears the column) for null/undefined
 *  input, or a Fail on the first invalid entry. */
export function normDocuments(v: unknown): { value: DocRef[] | null; error?: Fail } {
  if (v === null || v === undefined) return { value: null };
  if (!Array.isArray(v)) return { value: null, error: { field: "documents", message: "must be an array" } };

  const out: DocRef[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") return { value: null, error: { field: "documents", message: "each entry must be an object" } };
    const item = raw as Record<string, unknown>;
    const title = normText(item.title);
    if (!title) return { value: null, error: { field: "documents", message: "each entry requires a title" } };
    const url = normText(item.url);
    if (url && !DOC_URL_RE.test(url))
      return { value: null, error: { field: "documents", message: "url must start with http(s)://, /, or a file path" } };
    const note = normText(item.note);
    out.push({ title, ...(url ? { url } : {}), ...(note ? { note } : {}) });
  }
  return { value: out };
}
