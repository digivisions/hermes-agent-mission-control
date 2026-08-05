// seed-hq-context.ts — write hermes-context/<clients|projects>/<slug>/
// {context.md,documents.json} into Client.contextNotes / Client.documents
// (or the Project equivalents).
//
// Same family as seed-profile-context.sh: git-tracked content is the source
// of truth, the DB is a sink, re-runs are sha-stamped no-ops, and a slug
// missing from the registry is a warn+skip, never a create — the registry
// is owned by prisma/seed-clients.ts / prisma/seed-projects.ts.
//
//   npx tsx scripts/seed-hq-context.ts [--all|<slug>…] [--kind clients|projects] [--dry-run] [--force]
//
// Overwrite guard: contextNotes is hand-editable in the HQ UI. If the
// existing value is non-empty and does not start with the seeder's marker,
// it was hand-edited by Andy — print a diff and skip unless --force. Losing
// a hand-written note to a seeder would be the worst outcome of this spec.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const CONTEXT_DIR = process.env.CONTEXT_DIR ?? "hermes-context";
const MARKER_PREFIX = "<!-- hermes-context v1";

type Kind = "clients" | "projects";
const ALL_KINDS: Kind[] = ["clients", "projects"];

interface Args {
  all: boolean;
  slugs: string[];
  kind: Kind | null;
  dryRun: boolean;
  force: boolean;
}

interface DocumentEntry {
  title: string;
  url?: string;
  note?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { all: false, slugs: [], kind: null, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--kind") {
      const v = argv[++i];
      if (v !== "clients" && v !== "projects") {
        throw new Error(`invalid --kind '${v ?? ""}' (must be clients|projects)`);
      }
      args.kind = v;
    } else if (a.startsWith("--kind=")) {
      const v = a.slice("--kind=".length);
      if (v !== "clients" && v !== "projects") {
        throw new Error(`invalid --kind '${v}' (must be clients|projects)`);
      }
      args.kind = v;
    } else if (a.startsWith("--")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      args.slugs.push(a);
    }
  }
  if (!args.all && args.slugs.length === 0) {
    throw new Error(
      "usage: npx tsx scripts/seed-hq-context.ts [--all|<slug>…] [--kind clients|projects] [--dry-run] [--force]"
    );
  }
  return args;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function listSlugs(kind: Kind): Promise<string[]> {
  const dir = path.join(CONTEXT_DIR, kind);
  if (!(await dirExists(dir))) return [];
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function resolveSrcDir(kind: Kind, slug: string): Promise<string> {
  const base = path.join(CONTEXT_DIR, kind, slug);
  const sameAsPath = path.join(base, "SAME_AS");
  try {
    const target = (await readFile(sameAsPath, "utf8")).trim();
    if (!target) return base;
    const resolved = path.join(CONTEXT_DIR, target);
    if (!(await dirExists(resolved))) {
      throw new Error(`${slug}: SAME_AS target '${target}' does not exist`);
    }
    return resolved;
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return base;
    }
    throw err;
  }
}

function shaOf(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);
}

function buildMarker(slug: string, sha: string): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  return `${MARKER_PREFIX} slug=${slug} sha=${sha} seeded=${now} -->`;
}

// Minimal line-based diff (LCS), good enough for a short contextNotes preview.
function diffLines(oldText: string, newText: string): string {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < n) out.push(`- ${a[i++]}`);
  while (j < m) out.push(`+ ${b[j++]}`);
  return out.join("\n");
}

interface Registered {
  slug: string;
  contextNotes: string | null;
  documents: Prisma.JsonValue;
}

async function findRegistered(kind: Kind, slug: string): Promise<Registered | null> {
  if (kind === "clients") {
    const row = await prisma.client.findUnique({
      where: { slug },
      select: { slug: true, contextNotes: true, documents: true },
    });
    return row;
  }
  const row = await prisma.project.findUnique({
    where: { slug },
    select: { slug: true, contextNotes: true, documents: true },
  });
  return row;
}

async function updateRegistered(
  kind: Kind,
  slug: string,
  contextNotes: string,
  documents: DocumentEntry[]
): Promise<void> {
  if (kind === "clients") {
    await prisma.client.update({
      where: { slug },
      data: { contextNotes, documents: documents as unknown as Prisma.InputJsonValue },
    });
    return;
  }
  await prisma.project.update({
    where: { slug },
    data: { contextNotes, documents: documents as unknown as Prisma.InputJsonValue },
  });
}

async function seedOne(kind: Kind, slug: string, args: Args): Promise<"ok" | "skip" | "fail"> {
  const srcDir = await resolveSrcDir(kind, slug);
  const contextPath = path.join(srcDir, "context.md");
  const documentsPath = path.join(srcDir, "documents.json");

  let contextMd: string;
  try {
    contextMd = await readFile(contextPath, "utf8");
  } catch {
    console.warn(`⚠ ${slug} (${kind}): no context.md in ${srcDir} — skipping`);
    return "skip";
  }

  let documents: DocumentEntry[] = [];
  try {
    const raw = await readFile(documentsPath, "utf8");
    documents = JSON.parse(raw) as DocumentEntry[];
  } catch (err) {
    console.error(`✗ ${slug}: documents.json missing or invalid JSON in ${srcDir}: ${String(err)}`);
    return "fail";
  }

  const registered = await findRegistered(kind, slug);
  if (!registered) {
    console.warn(`⚠ ${slug} (${kind}): not in the registry — skipping (seed-${kind}.ts owns creation)`);
    return "skip";
  }

  const sha = shaOf(contextMd + JSON.stringify(documents));
  const marker = buildMarker(slug, sha);
  const finalContextNotes = `${marker}\n${contextMd}`;

  const existing = registered.contextNotes ?? "";
  const existingIsMarked = existing.startsWith(MARKER_PREFIX);
  const existingSha = existingIsMarked ? existing.match(/sha=([0-9a-f]{12})/)?.[1] : undefined;

  if (existingIsMarked && existingSha === sha) {
    console.log(`✓ = ${slug} unchanged (sha=${sha})`);
    return "ok";
  }

  if (existing.length > 0 && !existingIsMarked && !args.force) {
    console.log(`⚠ ${slug}: contextNotes was hand-edited in the UI (no hermes-context marker) — skipping.`);
    console.log(diffLines(existing, finalContextNotes));
    console.log(`  Use --force to overwrite Andy's hand-written note.`);
    return "skip";
  }

  if (args.dryRun) {
    console.log(`▸ ${slug} (${kind}) — dry run, would write:`);
    console.log(diffLines(existing, finalContextNotes));
    return "ok";
  }

  await updateRegistered(kind, slug, finalContextNotes, documents);
  console.log(`✓ ${slug} → contextNotes (${finalContextNotes.length}c), ${documents.length} document(s)`);
  return "ok";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const kindsToScan: Kind[] = args.kind ? [args.kind] : ALL_KINDS;

  const work: Array<{ kind: Kind; slug: string }> = [];
  let badSlugs = 0;

  if (args.all) {
    for (const kind of kindsToScan) {
      for (const slug of await listSlugs(kind)) {
        work.push({ kind, slug });
      }
    }
  } else {
    for (const slug of args.slugs) {
      let found = false;
      for (const kind of kindsToScan) {
        if (await dirExists(path.join(CONTEXT_DIR, kind, slug))) {
          work.push({ kind, slug });
          found = true;
        }
      }
      if (!found) {
        console.error(`✗ no ${CONTEXT_DIR}/{${kindsToScan.join(",")}}/${slug} directory found`);
        badSlugs++;
      }
    }
  }

  let fail = badSlugs;
  let ok = 0;
  for (const { kind, slug } of work) {
    try {
      const result = await seedOne(kind, slug, args);
      if (result === "fail") fail++;
      else ok++;
    } catch (err) {
      console.error(`✗ ${slug}: ${err instanceof Error ? err.message : String(err)}`);
      fail++;
    }
  }

  console.log(`\n${ok}/${work.length} slugs OK.${badSlugs > 0 ? ` (${badSlugs} slug(s) had no hermes-context directory)` : ""}`);
  process.exitCode = Math.min(fail, 125);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
