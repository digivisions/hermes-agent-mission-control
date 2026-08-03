"use client";

import { useEffect, useState } from "react";
import { FolderKanban, Clock, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eyebrow, Panel, Pill } from "@/components/ui/kit";

interface Project {
  slug: string; name: string; status: string; priority: string; updated: string;
  tags: string[]; overview: string; nextActions: string[]; waitingOn: string[]; location: string;
}

const statusTone: Record<string, "up" | "warn" | "down" | "neutral"> = {
  active: "up", ongoing: "up",
  paused: "warn", planned: "neutral",
  blocked: "down", complete: "neutral", done: "neutral", unknown: "neutral",
};
const prioTone: Record<string, "warn" | "accent" | "neutral"> = {
  high: "warn", medium: "accent", low: "neutral", unknown: "neutral",
};
const ORDER_KEY = "hermy-projects-order-v1";

function timeAgo(d: string | null) {
  if (!d) return "never";
  const diff = Date.now() - new Date(d + "T00:00:00").getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (dy > 0) return `${dy}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function SortableProject({ id, project }: { id: string; project: Project }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`hq-rise ${isDragging ? "opacity-90 relative" : ""}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing h-full" title="Drag to reorder">
        <Panel className="h-full flex flex-col p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-[var(--r-md)] flex items-center justify-center shrink-0"
                style={{ background: "var(--hq-elev-2)", color: "var(--hq-accent)" }}>
                <FolderKanban className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold text-[var(--hq-text)] truncate" style={{ fontFamily: "var(--font-display)" }}>{project.name}</h3>
                <div className="num text-[10.5px] text-[var(--hq-text-ghost)] mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {timeAgo(project.updated)}
                </div>
              </div>
            </div>
            <GripVertical className="w-4 h-4 text-[var(--hq-text-ghost)] shrink-0 opacity-50" />
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Pill tone={statusTone[project.status] || "neutral"}>{project.status}</Pill>
            <Pill tone={prioTone[project.priority] || "neutral"}>{project.priority}</Pill>
            {project.tags.slice(0, 2).map(t => (
              <Pill key={t} className="!text-[var(--hq-text-ghost)]">{t}</Pill>
            ))}
          </div>

          {project.overview && (
            <p className="text-[13px] text-[var(--hq-text-2)] leading-relaxed line-clamp-3 mb-5">{project.overview}</p>
          )}

          {project.nextActions.length > 0 && (
            <div className="mt-auto pt-4 border-t border-[var(--hq-hairline)]">
              <div className="eyebrow !text-[9.5px] mb-2.5">Next Actions</div>
              <div className="space-y-2">
                {project.nextActions.slice(0, 3).map((a, i) => (
                  <div key={i} className="text-[12px] text-[var(--hq-text-2)] leading-snug flex gap-2.5">
                    <span className="num text-[var(--hq-accent)] shrink-0">{i + 1}.</span>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.projects) {
          setProjects(d.projects);
          try {
            const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
            if (Array.isArray(saved) && saved.length === d.projects.length) setOrder(saved);
            else setOrder(d.projects.map((p: Project) => p.slug));
          } catch { setOrder(d.projects.map((p: Project) => p.slug)); }
        }
        if (d?.error) setError(d.error);
      })
      .catch(() => setError("Failed to load projects"))
      .finally(() => setLoaded(true));
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)));
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const ordered = order.length === projects.length ? order.map(id => projects.find(p => p.slug === id)!).filter(Boolean) : projects;

  return (
    <div className="relative z-10 w-full mx-auto pb-20">
      <div className="pt-4 pb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-3">Workspace</div>
          <h1 className="text-[36px] font-semibold tracking-[-0.02em] leading-none text-[var(--hq-text)]" style={{ fontFamily: "var(--font-display)" }}>Projects</h1>
          <p className="num text-[var(--hq-text-ghost)] text-[12.5px] mt-3">{projects.length} notes · synced from Obsidian vault · drag to reorder</p>
        </div>
      </div>

      {error && <div className="text-[12.5px] text-[var(--hq-down)] mb-4">{error}</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {ordered.map(p => (
              <SortableProject key={p.slug} id={p.slug} project={p} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {loaded && projects.length === 0 && (
        <div className="text-[13px] text-[var(--hq-text-ghost)] py-16 text-center">
          No projects found in the vault mirror. Check that ~/sync-vault.sh has run.
        </div>
      )}
    </div>
  );
}
