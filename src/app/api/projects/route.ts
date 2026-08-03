import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Read the Obsidian vault mirror synced from the Mac (see ~/sync-vault.sh on VPS).
const VAULT_PROJECTS_DIR = process.env.VAULT_MIRROR_DIR
  ? path.join(process.env.VAULT_MIRROR_DIR, "Projects")
  : "/home/andy/vault-mirror/Projects";

interface ProjectNote {
  slug: string;
  name: string;
  status: string;
  priority: string;
  updated: string;
  tags: string[];
  overview: string;
  nextActions: string[];
  waitingOn: string[];
  location: string;
  raw: string;
}

function parseFrontmatter(raw: string): Record<string, string> {
  const fm: Record<string, string> = {};
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return fm;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^"|"$/g, "").trim();
  }
  return fm;
}

function section(raw: string, heading: string): string {
  const re = new RegExp(`##\\s*${heading}[\\s\\S]*?(?=\\n##\\s|$)`);
  const m = raw.match(re);
  return m ? m[0].replace(new RegExp(`##\\s*${heading}`), "").trim() : "";
}

function bullets(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("##"));
}

export async function GET() {
  const projects: ProjectNote[] = [];
  let dirError: string | null = null;

  try {
    const files = fs
      .readdirSync(VAULT_PROJECTS_DIR)
      .filter((f) => f.endsWith(".md") && f !== "00 - Project Index.md");

    for (const file of files) {
      const raw = fs.readFileSync(path.join(VAULT_PROJECTS_DIR, file), "utf8");
      const fm = parseFrontmatter(raw);
      const name = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.replace(/\.md$/, "");
      projects.push({
        slug: file.replace(/\.md$/, ""),
        name,
        status: fm.status || "unknown",
        priority: fm.priority || "medium",
        updated: fm.updated || "",
        tags: (fm.tags || "").replace(/[\[\]]/g, "").split(",").map((t) => t.trim()).filter(Boolean),
        overview: section(raw, "Overview").slice(0, 600),
        nextActions: bullets(section(raw, "Next Actions")).slice(0, 6),
        waitingOn: bullets(section(raw, "Waiting On")).slice(0, 4),
        location: fm.location || "",
        raw,
      });
    }
  } catch (e) {
    dirError = e instanceof Error ? e.message : String(e);
  }

  // Sort: priority (high first), then updated desc
  const prioRank: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
  projects.sort((a, b) => {
    const p = (prioRank[a.priority] ?? 3) - (prioRank[b.priority] ?? 3);
    if (p !== 0) return p;
    return (b.updated || "").localeCompare(a.updated || "");
  });

  return NextResponse.json(
    {
      projects,
      count: projects.length,
      source: VAULT_PROJECTS_DIR,
      syncedAt: (() => {
        try {
          const st = fs.statSync(VAULT_PROJECTS_DIR);
          return st.mtime.toISOString();
        } catch {
          return null;
        }
      })(),
      error: dirError,
    },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  );
}
