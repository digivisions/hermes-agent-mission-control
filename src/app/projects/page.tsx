"use client";

import { useEffect, useState } from "react";
import { FolderKanban, ArrowUpRight, Clock } from "lucide-react";
import { Eyebrow, Panel, Pill } from "@/components/ui/kit";

interface Project {
  slug: string; name: string; status: string; priority: string; updated: string;
  tags: string[]; overview: string; nextActions: string[]; waitingOn: string[]; location: string;
}

const statusTone: Record<string, string> = {
  active: "var(--up)", ongoing: "var(--up)",
  paused: "var(--warn)", blocked: "var(--down)",
  planned: "var(--accent)", complete: "var(--text-3)", done: "var(--text-3)",
};

function timeAgo(d: string | null) {
  if (!d) return "never";
  const diff = Date.now() - new Date(d + "T00:00:00").getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (dy > 0) return `${dy}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.projects) setProjects(d.projects); if (d?.error) setError(d.error); })
      .catch(() => setError("Failed to load projects"))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="pt-4 pb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2.5">Workspace</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--hq-text)]">Projects</h1>
          <p className="num text-[var(--hq-text-ghost)] text-[12px] mt-2.5">{projects.length} notes · synced from Obsidian vault</p>
        </div>
      </div>

      {error && <div className="text-[12.5px] text-[var(--hq-down)] mb-4">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {projects.map((p, i) => (
          <Panel key={p.slug} className="h-full flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderKanban className="w-4 h-4 shrink-0 text-[var(--hq-text-ghost)]" />
                <h3 className="text-[15px] font-semibold text-[var(--hq-text)] truncate">{p.name}</h3>
              </div>
              <span className="flex items-center gap-1.5 shrink-0" style={{ color: statusTone[p.status] || "var(--hq-text-ghost)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
                <span className="text-[11px] font-medium capitalize">{p.status}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Pill>{p.priority}</Pill>
              {p.tags.slice(0, 3).map(t => <Pill key={t} className="!text-[var(--hq-text-faint)]">{t}</Pill>)}
              {p.updated && (
                <span className="num text-[10.5px] text-[var(--hq-text-faint)] ml-auto flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {timeAgo(p.updated)}
                </span>
              )}
            </div>

            {p.overview && <p className="text-[12.5px] text-[var(--hq-text-2)] leading-relaxed line-clamp-3 mb-4">{p.overview}</p>}

            {p.nextActions.length > 0 && (
              <div className="mt-auto pt-3 border-t border-[var(--hq-hairline)]">
                <div className="eyebrow !text-[9.5px] mb-1.5">Next Actions</div>
                <div className="space-y-1">
                  {p.nextActions.slice(0, 3).map((a, i) => (
                    <div key={i} className="text-[11.5px] text-[var(--hq-text-2)] leading-snug">• {a}</div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        ))}
      </div>

      {loaded && projects.length === 0 && (
        <div className="text-[13px] text-[var(--hq-text-ghost)] py-16 text-center">
          No projects found in the vault mirror. Check that ~/sync-vault.sh has run.
        </div>
      )}
    </div>
  );
}
