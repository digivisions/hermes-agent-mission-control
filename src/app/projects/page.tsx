"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Clock, GripVertical, Pencil, FileText, Plus } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Panel, Pill, Button, EmptyState } from "@/components/ui/kit";
import { ProjectEditor, type ProjectCardLike } from "@/components/project-editor";

interface Project {
  slug: string; name: string; type: string; status: string; priority: string;
  sortOrder: number; tags: string[]; overview: string | null;
  nextActions: string[]; waitingOn: string[]; location: string | null;
  accent: string | null; description: string | null; contextNotes: string | null;
  createdAt: string; updatedAt: string;
}

const statusTone: Record<string, "up" | "warn" | "down" | "neutral"> = {
  active: "up", ongoing: "up",
  paused: "warn", planned: "neutral",
  blocked: "down", complete: "neutral", archived: "neutral",
};
const prioTone: Record<string, "warn" | "accent" | "neutral"> = {
  high: "warn", medium: "accent", low: "neutral",
};

function timeAgo(d: string | null) {
  if (!d) return "never";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (dy > 0) return `${dy}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function SortableProject({ id, project, onEdit }: { id: string; project: Project; onEdit: (p: Project) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`hq-rise ${isDragging ? "opacity-90 relative" : ""}`}
    >
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
                <Clock className="w-3 h-3" /> {timeAgo(project.updatedAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              aria-label={`Edit ${project.name}`}
              onClick={() => onEdit(project)}
              className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 rounded text-[var(--hq-text-ghost)] opacity-50 hover:opacity-100"
              title="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Pill tone={statusTone[project.status] || "neutral"}>{project.status}</Pill>
          <Pill tone={prioTone[project.priority] || "neutral"}>{project.priority}</Pill>
          {project.tags.slice(0, 2).map(t => (
            <Pill key={t} className="!text-[var(--hq-text-ghost)]">{t}</Pill>
          ))}
          {project.contextNotes && (
            <Pill className="!text-[var(--text-3)]">
              <FileText className="w-3 h-3" /> context
            </Pill>
          )}
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
  );
}

type EditorState = { mode: "create" } | { mode: "edit"; project: Project };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(() => {
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.projects) {
          setProjects(d.projects);
          setOrder(d.projects.map((p: Project) => p.slug));
        }
        if (d?.error) setError(d.error);
      })
      .catch(() => setError("Failed to load projects"))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)));
      fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next }),
      }).catch(() => {});
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
          <p className="num text-[var(--hq-text-ghost)] text-[12.5px] mt-3">{projects.length} internal projects · drag to reorder</p>
        </div>
        <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
          <Plus className="w-3.5 h-3.5" /> New project
        </Button>
      </div>

      {error && <div className="text-[12.5px] text-[var(--hq-down)] mb-4">{error}</div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {ordered.map(p => (
              <SortableProject key={p.slug} id={p.slug} project={p} onEdit={(proj) => setEditor({ mode: "edit", project: proj })} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {loaded && projects.length === 0 && (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          hint="Projects are Digital Visions' own work. Client work lives on /clients."
          action={<Button variant="primary" onClick={() => setEditor({ mode: "create" })}>New project</Button>}
        />
      )}

      {editor && (
        <ProjectEditor
          mode={editor.mode}
          initial={editor.mode === "edit" ? (editor.project as unknown as Partial<ProjectCardLike>) : undefined}
          onSaved={load}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
