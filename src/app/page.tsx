"use client";

import { useEffect, useState } from "react";
import {
  Briefcase, Flower2, Cpu, ClipboardList, ArrowUpRight, Activity, HardDrive,
  Wallet, CalendarDays, CircleCheck, CircleDashed, CircleAlert, Server,
} from "lucide-react";
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

const statusTone: Record<string, string> = {
  active: "var(--up)", ongoing: "var(--up)",
  paused: "var(--warn)", blocked: "var(--down)",
  planned: "var(--accent)", complete: "var(--text-3)", done: "var(--text-3)",
};
const prioLabel: Record<string, string> = { high: "High", medium: "Med", low: "Low" };
const StatusIcon = ({ s }: { s: string }) =>
  s === "active" || s === "ongoing" ? <CircleCheck className="w-3.5 h-3.5" /> :
  s === "paused" || s === "planned" ? <CircleDashed className="w-3.5 h-3.5" /> :
  <CircleAlert className="w-3.5 h-3.5" />;

const rise = (i: number) => ({ animationDelay: `${i * 60}ms` });

// ── Small panels ──────────────────────────────────────────
function ProjectsPanel({ projects }: { projects: Project[] }) {
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Active Projects</Eyebrow>
        <Pill>{projects.filter(p => p.status === "active" || p.status === "ongoing").length} active</Pill>
      </div>
      <div className="space-y-1.5">
        {projects.slice(0, 7).map(p => (
          <div key={p.slug} className="flex items-center gap-3 rounded-lg border border-[var(--hq-hairline)] bg-white/[0.02] px-3 py-2.5">
            <span style={{ color: statusTone[p.status] || "var(--hq-text-ghost)" }}>
              <StatusIcon s={p.status} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[var(--hq-text)] truncate">{p.name}</div>
              <div className="num text-[10.5px] text-[var(--hq-text-ghost)]">updated {timeAgo(p.updated ? new Date(p.updated + "T00:00:00").toISOString() : null)}</div>
            </div>
            <Pill>{prioLabel[p.priority] || p.priority}</Pill>
          </div>
        ))}
        {projects.length === 0 && <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-6 text-center">No projects synced yet</div>}
      </div>
    </Panel>
  );
}

function KlailyPanel({ k }: { k: KlailyData }) {
  const rev = k.revenue;
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Klaily · {k.month}</Eyebrow>
        <Pill>Shopify</Pill>
      </div>
      <div className="flex items-end gap-2">
        <span className="num font-semibold text-[34px] leading-none tracking-[-0.02em] text-[var(--hq-text)]">
          {rev === null ? "—" : `$${rev.toLocaleString("en-US")}`}
        </span>
        {k.orders !== null && <span className="num text-[12px] text-[var(--hq-text-ghost)] mb-1">{k.orders} orders</span>}
      </div>
      <div className="mt-3 space-y-2">
        {k.palmstreetYearly && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--hq-text-ghost)]">
            <span className="eyebrow !text-[9.5px]">Palmstreet (vault)</span>
            <span className="num">~${k.palmstreetYearly}/yr</span>
          </div>
        )}
        {k.note && <div className="text-[12px] text-[var(--hq-text-ghost)]">{k.note}</div>}
        {k.source === "manual" && rev === null && (
          <div className="text-[12px] text-[var(--hq-warn)]">No revenue entered yet — edit on the Klaily page.</div>
        )}
      </div>
    </Panel>
  );
}

function EchoPanel({ project }: { project?: Project }) {
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Echo · Build Status</Eyebrow>
        {project && <Pill>{project.status}</Pill>}
      </div>
      {project ? (
        <>
          <div className="text-[13px] font-medium text-[var(--hq-text)] mb-1">Micro-Recorder (ESP32-S3)</div>
          <p className="text-[12px] text-[var(--hq-text-ghost)] leading-relaxed line-clamp-3">
            {project.overview?.split(". ").slice(0, 2).join(". ") || "No overview in vault note."}
          </p>
          {project.nextActions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--hq-hairline)]">
              <div className="eyebrow !text-[9.5px] mb-1.5">Next</div>
              <div className="space-y-1">
                {project.nextActions.slice(0, 2).map((a, i) => (
                  <div key={i} className="text-[11.5px] text-[var(--hq-text-2)] leading-snug">• {a}</div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-4">Echo note not found in vault mirror</div>
      )}
    </Panel>
  );
}

function TasksPanel({ data }: { data: TaskData | null }) {
  const total = data?.total ?? 0;
  const counts = data?.counts ?? {};
  const statusOrder = ["todo", "ready", "running", "done"];
  const labels: Record<string, string> = { todo: "Todo", ready: "Ready", running: "Running", done: "Done" };
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Task Board</Eyebrow>
        <Pill>{total} tasks</Pill>
      </div>
      {total > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {statusOrder.map(s => (
            <div key={s} className="rounded-lg border border-[var(--hq-hairline)] bg-white/[0.02] px-2 py-3 text-center">
              <div className="num font-semibold text-[20px] text-[var(--hq-text)]">{counts[s] || 0}</div>
              <div className="eyebrow !text-[9px] mt-1">{labels[s] || s}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12.5px] text-[var(--hq-text-ghost)] py-6 text-center">
          No kanban tasks yet — the bridge syncs them from Hermes.
        </div>
      )}
      {data?.lastSync && <div className="num text-[10px] text-[var(--hq-text-faint)] mt-3">synced {timeAgo(data.lastSync)}</div>}
    </Panel>
  );
}

function InfraPanel({ infra }: { infra: InfraData | null }) {
  const svc = infra?.services ?? [];
  const mounted = infra?.mounts?.filter(m => m.mounted) ?? [];
  return (
    <Panel className="h-full">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Infrastructure</Eyebrow>
        <Pill>{infra?.allUp ? "All systems up" : "Attention needed"}</Pill>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {svc.map(s => (
          <div key={s.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.up ? "var(--up)" : "var(--down)" }} />
            <span className="text-[var(--hq-text-2)]">{s.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--hq-hairline)] flex items-center gap-2 text-[11.5px] text-[var(--hq-text-ghost)]">
        <HardDrive className="w-3.5 h-3.5" />
        Mac mounts: <span className="num">{mounted.length}/{infra?.mounts?.length ?? 6} connected</span>
      </div>
      <div className="num text-[10px] text-[var(--hq-text-faint)] mt-1.5">
        vault synced {timeAgo(infra?.vaultSyncedAt ?? null)}
      </div>
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
    <Panel className="h-full">
      <div className="flex items-center justify-between mb-4">
        <Eyebrow>Recent Activity</Eyebrow>
        <Activity className="w-4 h-4 text-[var(--hq-text-ghost)]" />
      </div>
      <div className="space-y-2">
        {events.map((e, i) => (
          <div key={i} className="flex items-start gap-2.5 text-[12px]">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
            <div className="min-w-0">
              <div className="text-[var(--hq-text-2)] truncate">{e.title}</div>
              <div className="num text-[10px] text-[var(--hq-text-faint)]">{timeAgo(e.createdAt)}</div>
            </div>
          </div>
        ))}
        {events.length === 0 && <div className="text-[12px] text-[var(--hq-text-ghost)] py-4 text-center">No activity yet</div>}
      </div>
    </Panel>
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

  useEffect(() => { setMounted(true); }, []);
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

  if (!mounted) return null;

  const echo = projects.find(p => p.slug.includes("Echo") || p.slug.includes("Micro"));
  const activeCount = projects.filter(p => p.status === "active" || p.status === "ongoing").length;
  const openTasks = tasks ? (tasks.counts.todo || 0) + (tasks.counts.ready || 0) + (tasks.counts.running || 0) : 0;

  return (
    <>
      <div className="relative z-10 w-full mx-auto pb-16">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="hq-rise pt-4 pb-8 flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
          <div>
            <div className="eyebrow mb-2.5">{greeting()},</div>
            <h1 className="text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--hq-text)]">
              {process.env.NEXT_PUBLIC_OWNER_NAME || "Andy"}
            </h1>
            <p className="num text-[var(--hq-text-ghost)] text-[12.5px] mt-3">
              {time.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {"  ·  "}
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
              style={{ color: "var(--hq-up)", borderColor: "rgba(52,211,153,0.22)", background: "rgba(52,211,153,0.07)" }}>
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: "var(--up)" }} />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: "var(--up)" }} />
              </span>
              <span className="eyebrow !text-[9.5px] !text-[var(--hq-text-faint)]">Live</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white/[0.02] px-2.5 py-1">
              <Briefcase className="w-3 h-3 text-[var(--hq-text-ghost)]" />
              <span className="num text-[11px]">{activeCount} active</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white/[0.02] px-2.5 py-1">
              <ClipboardList className="w-3 h-3 text-[var(--hq-text-ghost)]" />
              <span className="num text-[11px]">{openTasks} open tasks</span>
            </div>
          </div>
        </div>

        {/* ── Brief + approvals ─────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
          <div className="xl:col-span-2 hq-rise" style={rise(1)}>
            <HermesBriefing />
          </div>
          <div className="xl:col-span-1 hq-rise" style={rise(2)}>
            <ApprovalInbox compact />
          </div>
        </div>

        {/* ── Projects + Klaily + Echo ───────────────────── */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <div className="lg:col-span-1 hq-rise" style={rise(3)}><ProjectsPanel projects={projects} /></div>
          <div className="lg:col-span-1 hq-rise" style={rise(4)}><KlailyPanel k={klaily || { month: new Date().toISOString().slice(0, 7), revenue: null, orders: null, note: "", source: "manual", palmstreetYearly: null, vaultUpdated: null }} /></div>
          <div className="lg:col-span-1 hq-rise" style={rise(5)}><EchoPanel project={echo} /></div>
        </div>

        {/* ── Tasks + Infra + Activity ──────────────────── */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          <div className="lg:col-span-1 hq-rise" style={rise(6)}><TasksPanel data={tasks} /></div>
          <div className="lg:col-span-1 hq-rise" style={rise(7)}><InfraPanel infra={infra} /></div>
          <div className="lg:col-span-1 hq-rise" style={rise(8)}><ActivityPanel /></div>
        </div>
      </div>
    </>
  );
}
