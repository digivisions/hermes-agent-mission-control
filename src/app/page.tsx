"use client";

import { useEffect, useState } from "react";
import {
  Briefcase, Activity, HardDrive, Wallet, GripVertical,
  CircleCheck, CircleDashed, CircleAlert, FolderKanban, LayoutGrid,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, arrayMove, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HermesBriefing } from "@/components/hermes-briefing";
import { ApprovalInbox } from "@/components/approval-inbox";
import { Eyebrow, Panel, Pill } from "@/components/ui/kit";

// ── Types ─────────────────────────────────────────────────
interface Project {
  slug: string; name: string; status: string; priority: string; updated: string;
  tags: string[]; overview: string; nextActions: string[]; waitingOn: string[]; location: string;
}
interface InfraService { name: string; up: boolean }
interface InfraData { services: InfraService[]; allUp: boolean; mounts: { label: string; mounted: boolean }[]; macConnected: boolean; vaultSyncedAt: string | null; generatedAt: string }
interface KlailyData { month: string; revenue: number | null; orders: number | null; note: string; source: string; palmstreetYearly: string | null; vaultUpdated: string | null }
interface TaskCounts { [status: string]: number }
interface TaskData { tasks: { title: string; status: string; priority: number | null }[]; counts: TaskCounts; total: number; lastSync: string | null }

// ── Panel registry — draggable dashboard cards ────────────
const PANELS = [
  { id: "projects", label: "Active Projects" },
  { id: "klaily", label: "Klaily Revenue" },
  { id: "echo", label: "Echo Status" },
  { id: "tasks", label: "Task Board" },
  { id: "infra", label: "Infrastructure" },
  { id: "activity", label: "Recent Activity" },
] as const;
type PanelId = (typeof PANELS)[number]["id"];
const ORDER_KEY = "hermy-dashboard-order-v1";

// ── Helpers ───────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function timeAgo(d: string | null) {
  if (!d) return "never";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (dy > 0) return `${dy}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

const statusTone: Record<string, "up" | "warn" | "down" | "neutral"> = {
  active: "up", ongoing: "up",
  paused: "warn", planned: "neutral",
  blocked: "down", complete: "neutral", done: "neutral", unknown: "neutral",
};
const prioTone: Record<string, "warn" | "accent" | "neutral"> = {
  high: "warn", medium: "accent", low: "neutral", unknown: "neutral",
};
const StatusIcon = ({ s }: { s: string }) =>
  s === "active" || s === "ongoing" ? <CircleCheck className="w-3.5 h-3.5" /> :
  s === "paused" || s === "planned" ? <CircleDashed className="w-3.5 h-3.5" /> :
  <CircleAlert className="w-3.5 h-3.5" />;

const rise = (i: number) => ({ animationDelay: `${i * 60}ms` });

// ── Draggable wrapper ─────────────────────────────────────
function SortablePanel({ id, index, children, className = "" }: {
  id: string; index: number; children: React.ReactNode; className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined }}
      className={`hq-rise ${isDragging ? "opacity-90 relative" : ""}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing h-full"
        title="Drag to reorder"
      >
        <Panel className={`h-full flex flex-col p-7 ${className}`}>
          {/* drag handle */}
          <div className="flex items-center justify-between -mt-1 mb-4 select-none">
            <Eyebrow>{PANELS[index]?.label}</Eyebrow>
            <GripVertical className="w-4 h-4 text-[var(--hq-text-ghost)] opacity-50 group-hover:opacity-100" />
          </div>
          <div className="flex-1 flex flex-col min-h-0">{children}</div>
        </Panel>
      </div>
    </div>
  );
}

// ── Panels ────────────────────────────────────────────────
function ProjectsPanel({ projects }: { projects: Project[] }) {
  const active = projects.filter(p => p.status === "active" || p.status === "ongoing");
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Pill tone="up">{active.length} active</Pill>
      </div>
      <div className="space-y-3">
        {projects.slice(0, 6).map(p => (
          <div key={p.slug} className="flex items-center gap-3.5 rounded-xl border border-[var(--hq-hairline)] bg-[var(--hq-elev-1)] px-4 py-3.5">
            <span className="shrink-0" style={{ color: "var(--hq-up)" }}>
              <StatusIcon s={p.status} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-medium text-[var(--hq-text)] truncate">{p.name}</div>
              <div className="num text-[10.5px] text-[var(--hq-text-ghost)] mt-1">updated {timeAgo(p.updated ? new Date(p.updated + "T00:00:00").toISOString() : null)}</div>
            </div>
            <Pill tone={prioTone[p.priority] || "neutral"} className="shrink-0">{p.priority}</Pill>
          </div>
        ))}
        {projects.length === 0 && <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-10 text-center">No projects synced yet</div>}
      </div>
    </>
  );
}

function KlailyPanel({ k }: { k: KlailyData }) {
  const rev = k.revenue;
  return (
    <>
      <div className="flex items-end gap-2.5 mb-2">
        <span className="num font-semibold text-[36px] leading-none tracking-[-0.02em] text-[var(--hq-text)]">
          {rev === null ? "—" : `$${rev.toLocaleString("en-US")}`}
        </span>
        {k.orders !== null && <span className="num text-[12px] text-[var(--hq-text-ghost)] mb-1">{k.orders} orders</span>}
      </div>
      <div className="eyebrow !text-[9.5px] mb-5">{k.month} · Shopify</div>
      <div className="space-y-3 pt-4 border-t border-[var(--hq-hairline)] mt-auto">
        {k.palmstreetYearly && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--hq-text-2)]">
            <Wallet className="w-3.5 h-3.5 text-[var(--hq-accent)]" />
            <span>Palmstreet ~${k.palmstreetYearly}/yr</span>
          </div>
        )}
        {k.note && <div className="text-[12px] text-[var(--hq-text-2)]">{k.note}</div>}
        {k.source === "manual" && rev === null && (
          <div className="text-[12px] text-[var(--hq-warn)] flex items-center gap-1.5">
            <CircleDashed className="w-3.5 h-3.5" /> No revenue entered — edit on the Klaily page
          </div>
        )}
      </div>
    </>
  );
}

function EchoPanel({ project }: { project?: Project }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <Pill tone={project ? statusTone[project.status] || "neutral" : "neutral"}>{project?.status || "—"}</Pill>
      </div>
      <div className="text-[13.5px] font-semibold text-[var(--hq-text)] mb-2">Micro-Recorder (ESP32-S3)</div>
      {project ? (
        <>
          <p className="text-[12.5px] text-[var(--hq-text-2)] leading-relaxed line-clamp-3 mb-4">
            {project.overview?.split(". ").slice(0, 2).join(". ") || "No overview in vault note."}
          </p>
          {project.nextActions.length > 0 && (
            <div className="mt-auto pt-4 border-t border-[var(--hq-hairline)]">
              <div className="eyebrow !text-[9.5px] mb-3">Next</div>
              <div className="space-y-2.5">
                {project.nextActions.slice(0, 2).map((a, i) => (
                  <div key={i} className="text-[11.5px] text-[var(--hq-text-2)] leading-relaxed flex gap-2.5">
                    <span className="num text-[var(--hq-accent)] shrink-0">{i + 1}.</span>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-4">Echo note not found in vault mirror</div>
      )}
    </>
  );
}

function TasksPanel({ data }: { data: TaskData | null }) {
  const total = data?.total ?? 0;
  const counts = data?.counts ?? {};
  const statusOrder: { key: string; label: string; tone: "up" | "accent" | "warn" | "neutral" }[] = [
    { key: "todo", label: "Todo", tone: "neutral" },
    { key: "ready", label: "Ready", tone: "accent" },
    { key: "running", label: "Running", tone: "warn" },
    { key: "done", label: "Done", tone: "up" },
  ];
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Pill tone={total > 0 ? "accent" : "neutral"}>{total} tasks</Pill>
      </div>
      {total > 0 ? (
        <div className="grid grid-cols-4 gap-2.5">
          {statusOrder.map(s => (
            <div key={s.key} className="rounded-xl border border-[var(--hq-hairline)] bg-[var(--hq-elev-1)] px-2 py-3.5 text-center">
              <div className="num font-semibold text-[22px] text-[var(--hq-text)]">{counts[s.key] || 0}</div>
              <div className="eyebrow !text-[9px] mt-1.5" style={{ color: `var(--hq-${s.tone})` }}>{s.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-8 text-center">
          No kanban tasks yet — the bridge syncs them from Hermes.
        </div>
      )}
      {data?.lastSync && <div className="num text-[10px] text-[var(--hq-text-faint)] mt-4">synced {timeAgo(data.lastSync)}</div>}
    </>
  );
}

function InfraPanel({ infra }: { infra: InfraData | null }) {
  const svc = infra?.services ?? [];
  const mounted = infra?.mounts?.filter(m => m.mounted) ?? [];
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Pill tone={infra?.allUp ? "up" : "down"}>{infra?.allUp ? "All systems up" : "Attention needed"}</Pill>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {svc.map(s => (
          <div key={s.name} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.up ? "var(--hq-up)" : "var(--hq-down)" }} />
            <span className="text-[var(--hq-text-2)]">{s.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-[var(--hq-hairline)] space-y-2">
        <div className="flex items-center gap-2 text-[11.5px] text-[var(--hq-text-2)]">
          <HardDrive className="w-3.5 h-3.5 text-[var(--hq-accent)]" />
          Mac mounts: <span className="num">{mounted.length}/{infra?.mounts?.length ?? 6} connected</span>
        </div>
        <div className="num text-[10px] text-[var(--hq-text-faint)]">vault synced {timeAgo(infra?.vaultSyncedAt ?? null)}</div>
      </div>
    </>
  );
}

function ActivityPanel() {
  const [events, setEvents] = useState<{ kind: string; title: string; createdAt: string }[]>([]);
  useEffect(() => {
    fetch("/api/hermes/activity").then(r => r.ok ? r.json() : null).then(d => {
      const list = Array.isArray(d) ? d : d?.events;
      if (Array.isArray(list)) setEvents(list.slice(0, 8));
    }).catch(() => {});
  }, []);
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Activity className="w-4 h-4 text-[var(--hq-accent)]" />
      </div>
      <div className="space-y-3.5">
        {events.map((e, i) => (
          <div key={i} className="flex items-start gap-3 text-[12.5px]">
            <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: "var(--hq-accent)" }} />
            <div className="min-w-0">
              <div className="text-[var(--hq-text-2)] leading-snug">{e.title}</div>
              <div className="num text-[10px] text-[var(--hq-text-faint)] mt-0.5">{timeAgo(e.createdAt)}</div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div className="text-[12px] text-[var(--hq-text-ghost)] py-8 text-center">No activity yet</div>}
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function Dashboard() {
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [infra, setInfra] = useState<InfraData | null>(null);
  const [klaily, setKlaily] = useState<KlailyData | null>(null);
  const [tasks, setTasks] = useState<TaskData | null>(null);
  const [order, setOrder] = useState<PanelId[]>(PANELS.map(p => p.id));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // load saved panel order
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
      if (Array.isArray(saved) && saved.length === PANELS.length) setOrder(saved);
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const load = () => {
      fetch("/api/projects").then(r => r.ok ? r.json() : null).then(d => { if (d?.projects) setProjects(d.projects); }).catch(() => {});
      fetch("/api/infra").then(r => r.ok ? r.json() : null).then(d => { if (d) setInfra(d); }).catch(() => {});
      fetch("/api/klaily/revenue").then(r => r.ok ? r.json() : null).then(d => { if (d) setKlaily(d); }).catch(() => {});
      fetch("/api/hermes/tasks").then(r => r.ok ? r.json() : null).then(d => { if (d) setTasks(d); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const oldIndex = prev.indexOf(active.id as PanelId);
      const newIndex = prev.indexOf(over.id as PanelId);
      const next = arrayMove(prev, oldIndex, newIndex);
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  if (!mounted) return null;

  const echo = projects.find(p => p.slug.includes("Echo") || p.slug.includes("Micro"));
  const activeCount = projects.filter(p => p.status === "active" || p.status === "ongoing").length;
  const openTasks = tasks ? (tasks.counts.todo || 0) + (tasks.counts.ready || 0) + (tasks.counts.running || 0) : 0;

  const panelContent: Record<PanelId, React.ReactNode> = {
    projects: <ProjectsPanel projects={projects} />,
    klaily: <KlailyPanel k={klaily || { month: new Date().toISOString().slice(0, 7), revenue: null, orders: null, note: "", source: "manual", palmstreetYearly: null, vaultUpdated: null }} />,
    echo: <EchoPanel project={echo} />,
    tasks: <TasksPanel data={tasks} />,
    infra: <InfraPanel infra={infra} />,
    activity: <ActivityPanel />,
  };

  return (
    <>
      <div className="relative z-10 w-full mx-auto pb-20">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="hq-rise pt-4 pb-10 flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
          <div>
            <div className="eyebrow mb-3">{greeting()},</div>
            <h1 className="text-[42px] font-semibold tracking-[-0.025em] leading-none text-[var(--hq-text)]" style={{ fontFamily: "var(--font-display)" }}>
              {process.env.NEXT_PUBLIC_OWNER_NAME || "Andy"}
            </h1>
            <p className="num text-[var(--hq-text-ghost)] text-[13px] mt-3.5">
              {time.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {"  ·  "}
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white px-3 py-1.5 text-[11px] font-medium"
              style={{ color: "var(--hq-up)", borderColor: "color-mix(in srgb, var(--hq-up) 30%, transparent)" }}>
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: "var(--hq-up)" }} />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: "var(--hq-up)" }} />
              </span>
              <span className="eyebrow !text-[9.5px] !text-[var(--hq-text-faint)]">Live</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white px-3 py-1.5">
              <Briefcase className="w-3 h-3 text-[var(--hq-accent)]" />
              <span className="num text-[11.5px] text-[var(--hq-text-2)]">{activeCount} active</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white px-3 py-1.5">
              <LayoutGrid className="w-3 h-3 text-[var(--hq-accent)]" />
              <span className="num text-[11.5px] text-[var(--hq-text-2)]">{openTasks} open tasks</span>
            </div>
          </div>
        </div>

        {/* ── Brief + approvals ─────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start mb-6">
          <div className="xl:col-span-2 hq-rise" style={rise(1)}>
            <HermesBriefing />
          </div>
          <div className="xl:col-span-1 hq-rise" style={rise(2)}>
            <ApprovalInbox compact />
          </div>
        </div>

        {/* ── Draggable panel grid ──────────────────────── */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-7 items-stretch">
              {order.map((id, i) => (
                <SortablePanel key={id} id={id} index={i}>
                  {panelContent[id]}
                </SortablePanel>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="mt-6 text-center">
          <span className="num text-[10.5px] text-[var(--hq-text-faint)]">Drag any card to reorder — layout is saved in your browser</span>
        </div>
      </div>
    </>
  );
}
