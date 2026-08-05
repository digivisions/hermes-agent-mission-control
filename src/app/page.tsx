"use client";

import { useEffect, useState } from "react";
import {
  Briefcase, Activity, HardDrive,
  CircleCheck, CircleDashed, CircleAlert, LayoutGrid, GripVertical,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HermesBriefing } from "@/components/hermes-briefing";
import { AssistantPanel } from "@/components/assistant-panel";
import { ClaudeUsageCard } from "@/components/claude-usage-card";
import { Eyebrow, Panel, Pill, SectionHeader, Button } from "@/components/ui/kit";
import {
  DEFAULT_DASHBOARD_ORDER, normalizeDashboardOrder, type DashboardSectionId,
} from "@/lib/dashboard-layout";

// ── Types ─────────────────────────────────────────────────
interface Project {
  slug: string; name: string; status: string; priority: string; updated: string;
  tags: string[]; overview: string; nextActions: string[]; waitingOn: string[]; location: string;
}
interface InfraService { name: string; up: boolean }
interface InfraData { services: InfraService[]; allUp: boolean; mounts: { label: string; mounted: boolean }[]; macConnected: boolean; vaultSyncedAt: string | null; generatedAt: string }
interface InfraHost {
  host: string; role: string; status: "up" | "down" | "degraded";
  uptimeS?: number | null; load1?: number | null;
  memUsedMb?: number | null; memTotalMb?: number | null;
  diskUsedPct?: number | null; detail?: string | null; lastError?: string | null;
  ts?: string;
}
interface InfraHealth { hosts: InfraHost[]; ts: string }

interface Cockpit {
  tiles: { pendingApprovals: number; activeRuns: number; infraAlerts: number;
           openTasks: number; spendMonthUsd: number; failed24h: number };
  bridge: { stale: boolean; lastSeen: string | null };
  throughput: { day: string; label: string; done: number; failed: number; rejected: number }[];
}

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

function humanizeUptime(s: number | null | undefined) {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

/** Fleet health across every host the bridge can reach — Mac, VPSes, cron. */
function InfrastructureHealthPanel({ data }: { data: InfraHealth | null }) {
  const hosts = data?.hosts ?? [];
  return (
    <Panel className="p-6 h-full">
      <SectionHeader label="Infrastructure" title="Fleet health" />
      {hosts.length === 0 ? (
        <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-10 text-center">no data yet</div>
      ) : (
        <div className="space-y-3">
          {hosts.map((h) => {
            const dot = h.status === "up" ? "var(--hq-up)" : h.status === "degraded" ? "var(--hq-warn)" : "var(--hq-down)";
            const memText = h.memTotalMb != null && h.memUsedMb != null
              ? `${(h.memUsedMb / 1024).toFixed(1)}/${(h.memTotalMb / 1024).toFixed(1)} GB`
              : "—";
            return (
              <div key={h.host} className="flex items-center gap-3.5 rounded-xl border border-[var(--hq-hairline)] bg-[var(--hq-elev-1)] px-4 py-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
                <div className="min-w-0 w-36 shrink-0">
                  <div className="text-[13px] font-medium text-[var(--hq-text)] truncate">{h.host}</div>
                  <div className="text-[10.5px] text-[var(--text-2)] truncate">{h.role}</div>
                </div>
                <div className="num text-[11.5px] text-[var(--hq-text-ghost)] w-16 shrink-0">{humanizeUptime(h.uptimeS)}</div>
                <div className="num text-[11.5px] text-[var(--hq-text-ghost)] w-14 shrink-0">{h.load1 != null ? h.load1.toFixed(2) : "—"}</div>
                <div className="num text-[11.5px] text-[var(--hq-text-ghost)] w-28 shrink-0">{memText}</div>
                <div className="flex-1 min-w-[90px]">
                  {h.diskUsedPct != null ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--hq-hairline)" }}>
                        <div className="h-full rounded-full" style={{ width: `${h.diskUsedPct}%`, background: h.diskUsedPct > 85 ? "var(--hq-down)" : "var(--accent)" }} />
                      </div>
                      <span className="num text-[11px] text-[var(--hq-text-ghost)] w-9 text-right">{h.diskUsedPct}%</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[var(--hq-text-ghost)] truncate">{h.detail ?? h.lastError ?? "—"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
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

/**
 * Row 1. Five numbers that answer "do I need to act?". Every tile links
 * somewhere — a tile you can't act on doesn't belong on a cockpit.
 *
 * NB: var(--hq-accent) does not exist; accent is var(--accent).
 */
function StatusStrip({ c }: { c: Cockpit | null }) {
  const t = c?.tiles;
  const tiles = [
    { label: "Pending approvals", value: t?.pendingApprovals ?? 0, href: "/approvals",
      color: (t?.pendingApprovals ?? 0) > 0 ? "var(--hq-warn)" : "var(--hq-text)" },
    { label: "Active agent runs", value: t?.activeRuns ?? 0, href: "/agents",
      color: (t?.activeRuns ?? 0) > 0 ? "var(--accent)" : "var(--hq-text)" },
    { label: "Infra alerts", value: t?.infraAlerts ?? 0, href: "/infrastructure",
      color: (t?.infraAlerts ?? 0) > 0 ? "var(--hq-down)" : "var(--hq-up)" },
    { label: "Open tasks", value: t?.openTasks ?? 0, href: "/tasks",
      color: "var(--hq-text)" },
    { label: "AI spend · month", value: t?.spendMonthUsd ?? 0, href: "/agents",
      color: "var(--hq-text)", money: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {tiles.map((tile) => (
        <Panel key={tile.label} href={tile.href} className="p-5">
          <Eyebrow>{tile.label}</Eyebrow>
          <div className="num font-semibold text-[30px] leading-none mt-2.5 tracking-[-0.02em]" style={{ color: tile.color }}>
            {tile.money
              ? `$${tile.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
              : tile.value}
          </div>
        </Panel>
      ))}
    </div>
  );
}

/**
 * Row 2. Stacked by outcome, 14 days. This is the "is the machine working"
 * chart — a failure-rate spike here is the earliest signal of a broken profile
 * or a wedged bridge.
 */
function ThroughputChart({ data }: { data: Cockpit["throughput"] }) {
  const empty = data.every((d) => d.done + d.failed + d.rejected === 0);
  return (
    <Panel className="p-6 h-full">
      <SectionHeader label="Throughput" title="Agent tasks · last 14 days" />
      {empty ? (
        <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-14 text-center">
          No agent runs in the last 14 days.
        </div>
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hq-hairline)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--hq-text-ghost)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--hq-text-ghost)" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--hq-elev-1)", border: "1px solid var(--hq-hairline)", borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="done"     stackId="1" stroke="var(--hq-up)"         fill="var(--hq-up)"         fillOpacity={0.22} name="Completed" />
              <Area type="monotone" dataKey="failed"   stackId="1" stroke="var(--hq-down)"       fill="var(--hq-down)"       fillOpacity={0.22} name="Failed" />
              <Area type="monotone" dataKey="rejected" stackId="1" stroke="var(--hq-text-ghost)" fill="var(--hq-text-ghost)" fillOpacity={0.18} name="Rejected" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

// ── Spec H · draggable cockpit ────────────────────────────
/**
 * Column spans on the single 12-col cockpit grid (D1). At `xl` these reproduce
 * the pre-Spec-H layout exactly: 12 (strip) · 12 (chart) · 8+4 (briefing+krisna)
 * · 4+4+4 (projects/infra/activity) · 12 (claude) · 12 (fleet). The `md` tier
 * (6 cols) keeps the old 2-up behaviour of the three small panels. Below `md`
 * everything is one column, as today.
 * Literal strings only — Tailwind's scanner cannot see interpolated classes.
 */
const SECTION_SPAN: Record<DashboardSectionId, string> = {
  "status-strip": "md:col-span-6 xl:col-span-12",
  "throughput":   "md:col-span-6 xl:col-span-12",
  "briefing":     "md:col-span-6 xl:col-span-8",
  "assistant":    "md:col-span-6 xl:col-span-4",
  "projects":     "md:col-span-3 xl:col-span-4",
  "infra":        "md:col-span-3 xl:col-span-4",
  "activity":     "md:col-span-3 xl:col-span-4",
  "claude-usage": "md:col-span-6 xl:col-span-12",
  "infra-health": "md:col-span-6 xl:col-span-12",
};

const SECTION_LABEL: Record<DashboardSectionId, string> = {
  "status-strip": "Chỉ số nhanh",
  "throughput":   "Throughput",
  "briefing":     "Chief of Staff",
  "assistant":    "Krisna",
  "projects":     "Active Projects",
  "infra":        "Infrastructure",
  "activity":     "Recent Activity",
  "claude-usage": "Claude Code usage",
  "infra-health": "Fleet health",
};

/**
 * Off arrange-mode this renders a plain positioned div and useSortable attaches
 * nothing (`disabled`), so the cockpit behaves exactly as it did before Spec H —
 * charts, tile links, Generate buttons, the settings gear, scrolling and touch
 * are all untouched (D2).
 *
 * On, an absolutely-positioned overlay takes every pointer event for the panel.
 * That is deliberate: the panels' own top-right controls (hermes-briefing.tsx:86-96,
 * assistant-panel.tsx:124-138) leave no free corner for a grip, and a full-surface
 * drag target means Andy can grab a panel anywhere.
 *
 * CSS.Translate, not CSS.Transform — the panels are different sizes and the
 * scale terms visibly squash them mid-drag (D3).
 */
function SortableSection({
  id, index, arranging, children,
}: { id: DashboardSectionId; index: number; arranging: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !arranging });

  return (
    <div
      ref={setNodeRef}
      style={{
        ...rise(index),
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 30 : undefined,
        boxShadow: isDragging ? "0 18px 40px -12px rgba(16,24,40,0.28)" : undefined,
        borderRadius: "var(--r-lg)",
      }}
      className={`relative hq-rise ${SECTION_SPAN[id]} ${isDragging ? "opacity-90" : ""}`}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
      {arranging && (
        <div
          {...attributes}
          {...listeners}
          role="button"
          aria-label={`Kéo để sắp xếp — ${SECTION_LABEL[id]}`}
          title="Kéo để sắp xếp"
          className="absolute inset-0 z-20 flex items-start justify-end p-3 cursor-grab active:cursor-grabbing"
          style={{
            borderRadius: "var(--r-lg)",
            border: "2px dashed color-mix(in srgb, var(--accent) 45%, transparent)",
            background: "color-mix(in srgb, var(--accent) 6%, transparent)",
          }}
        >
          <span
            className="rounded-full p-1.5 text-[var(--hq-text-ghost)]"
            style={{ background: "var(--hq-elev-1)", border: "1px solid var(--hq-hairline)" }}
          >
            <GripVertical className="w-4 h-4" />
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function Dashboard() {
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [infra, setInfra] = useState<InfraData | null>(null);
  const [cockpit, setCockpit] = useState<Cockpit | null>(null);
  const [infraHealth, setInfraHealth] = useState<InfraHealth | null>(null);
  const [order, setOrder] = useState<DashboardSectionId[]>(DEFAULT_DASHBOARD_ORDER);
  const [arranging, setArranging] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => { setMounted(true); }, []);

  // Layout loads once. Deliberately NOT in the 30s poll below: a poll response
  // landing after a drag would snap the panels back mid-session (D10).
  useEffect(() => {
    fetch("/api/dashboard-layout")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.order) setOrder(normalizeDashboardOrder(d.order)); })
      .catch(() => {});   // silence: DEFAULT_DASHBOARD_ORDER is already rendering
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const load = () => {
      fetch("/api/projects").then(r => r.ok ? r.json() : null).then(d => { if (d?.projects) setProjects(d.projects); }).catch(() => {});
      fetch("/api/infra").then(r => r.ok ? r.json() : null).then(d => { if (d) setInfra(d); }).catch(() => {});
      fetch("/api/hermes/cockpit").then(r => r.ok ? r.json() : null).then(d => { if (d) setCockpit(d); }).catch(() => {});
      fetch("/api/hermes/infra").then(r => r.ok ? r.json() : null).then(d => { if (d) setInfraHealth(d); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const next = arrayMove(
        prev,
        prev.indexOf(active.id as DashboardSectionId),
        prev.indexOf(over.id as DashboardSectionId),
      );
      fetch("/api/dashboard-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next }),
      }).catch(() => {});
      return next;
    });
  };

  if (!mounted) return null;

  const activeCount = projects.filter(p => p.status === "active" || p.status === "ongoing").length;
  const openTasks = cockpit?.tiles.openTasks ?? 0;

  const renderSection = (id: DashboardSectionId) => {
    switch (id) {
      case "status-strip":  return <StatusStrip c={cockpit} />;
      case "throughput":    return <ThroughputChart data={cockpit?.throughput ?? []} />;
      case "briefing":      return <HermesBriefing />;
      case "assistant":     return <AssistantPanel />;
      case "projects":      return (
        <Panel className="p-7 h-full flex flex-col">
          <Eyebrow>Active Projects</Eyebrow><div className="mt-4 flex-1"><ProjectsPanel projects={projects} /></div>
        </Panel>
      );
      case "infra":         return (
        <Panel className="p-7 h-full flex flex-col">
          <Eyebrow>Infrastructure</Eyebrow><div className="mt-4 flex-1"><InfraPanel infra={infra} /></div>
        </Panel>
      );
      case "activity":      return (
        <Panel className="p-7 h-full flex flex-col">
          <Eyebrow>Recent Activity</Eyebrow><div className="mt-4 flex-1"><ActivityPanel /></div>
        </Panel>
      );
      case "claude-usage":  return <ClaudeUsageCard />;
      case "infra-health":  return <InfrastructureHealthPanel data={infraHealth} />;
    }
  };

  return (
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
          {/* kit's Button takes no `title` (kit.tsx:146-155) — the tooltip lives on a wrapper. */}
          <span className="inline-flex" title={arranging ? "Thoát chế độ sắp xếp" : "Kéo các panel để sắp xếp lại"}>
            <Button
              size="sm"
              variant={arranging ? "primary" : "ghost"}
              onClick={() => setArranging(a => !a)}
            >
              <GripVertical className="w-3.5 h-3.5" />
              {arranging ? "Xong" : "Sắp xếp"}
            </Button>
          </span>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-6 items-stretch">
            {order.map((id, i) => (
              <SortableSection key={id} id={id} index={i} arranging={arranging}>
                {renderSection(id)}
              </SortableSection>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
