"use client";

import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, Bot, Cpu, ExternalLink } from "lucide-react";
import { Panel, Eyebrow, EmptyState, Pill, SectionHeader } from "@/components/ui/kit";
import { ClientChatThread } from "@/components/client-chat-thread";
import { ApprovalCard, timeAgo, type Req } from "@/components/approval-card";
import { Markdown } from "@/components/markdown";
import { ClientEditor } from "@/components/client-editor";

interface ClientRow {
  slug: string; name: string; type: string; hermesProfile: string | null;
  model: string; status: string; accent: string | null; description: string | null;
  contextNotes: string | null;
}
interface Run {
  id: string; kind: string; title: string; status: string; model: string | null;
  durationMs: number | null; costUsd: number | null; createdAt: string; error: string | null;
}
interface Task { id: string; title: string; status: string; priority: number | null }

function dur(ms: number | null) {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
const runTone = (s: string) =>
  s === "done" ? "up" : s === "failed" ? "down" :
  s === "awaiting_approval" ? "warn" : s === "rejected" ? "neutral" : "accent";

export default function ClientWorkspace({ params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = use(params);
  const [data, setData] = useState<{ client: ClientRow; approvals: Req[]; runs: Run[]; tasks: Task[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${slug}`);
      if (r.status === 404) { setNotFound(true); return; }
      if (r.ok) setData(await r.json());
    } catch { /* next poll retries */ }
  }, [slug]);

  // 10s: the rail is glanceable context, not the conversation. The chat thread
  // runs its own 3s poll while a request is in flight.
  useEffect(() => { load(); const iv = setInterval(load, 10_000); return () => clearInterval(iv); }, [load]);

  if (notFound) return (
    <div className="pt-10">
      <EmptyState icon={<Bot className="w-6 h-6" />} title={`No client '${slug}' in the registry`}
        hint="Add it to prisma/seed-clients.ts and re-run npm run db:seed:clients on the VPS." />
    </div>
  );

  const c = data?.client;
  const live = !!(c && c.status === "active" && c.hermesProfile);
  const tasksByStatus = (data?.tasks ?? []).reduce<Record<string, number>>(
    (a, t) => ((a[t.status] = (a[t.status] || 0) + 1), a), {});

  return (
    <div className="relative z-10 w-full mx-auto pb-10 flex flex-col" style={{ minHeight: "calc(100vh - 2rem)" }}>
      <div className="hq-rise pt-4 pb-6">
        <a href="/clients" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Clients
        </a>
        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Client workspace</Eyebrow>
            <div className="mt-2 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: live ? "var(--up)" : "var(--warn)" }}
                    title={live ? "Hermes profile active" : "No Hermes profile — run scripts/provision-profile.sh"} />
              <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--text)]">
                {c?.name ?? slug}
              </h1>
            </div>
            {c?.description && <p className="mt-2 text-[12.5px] text-[var(--text-2)] max-w-xl">{c.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            {c && <Pill tone="neutral">{c.type}</Pill>}
            {c && <Pill tone="accent"><Cpu className="w-3 h-3" /> {c.model}</Pill>}
            <a href="/agents" className="inline-flex items-center gap-1 text-[12px] text-[var(--text-3)] hover:text-[var(--text)]">
              Agents <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start flex-1 min-h-0">
        <div className="xl:col-span-2 h-full min-h-0" style={{ minHeight: "62vh" }}>
          <Panel className="h-full min-h-0 flex flex-col p-0 overflow-hidden">
            <ClientChatThread
              client={slug}
              disabled={!c?.hermesProfile}
              disabledReason={`No Hermes profile for ${c?.name ?? slug} yet — run scripts/provision-profile.sh ${slug} on the VPS.`}
            />
          </Panel>
        </div>

        <div className="xl:col-span-1 flex flex-col gap-5">
          {/* 1 — Needs decision: always top; it's why he opened the page */}
          <div>
            <SectionHeader label="Needs decision"
              action={<Pill tone={(data?.approvals.length ?? 0) > 0 ? "warn" : "neutral"}>{data?.approvals.length ?? 0}</Pill>} />
            {data && data.approvals.length === 0 ? (
              <Panel className="p-2"><EmptyState title="Nothing needs you for this client." /></Panel>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data?.approvals.map((r) => <ApprovalCard key={r.id} req={r} compact onAction={load} />)}
              </div>
            )}
          </div>

          {/* 2 — Recent agent runs: doubles as the per-client audit log */}
          <div>
            <SectionHeader label="Recent agent runs" />
            <Panel className="p-4">
              {data?.runs.length ? (
                <div className="flex flex-col gap-3">
                  {data.runs.map((r) => (
                    <div key={r.id} className="flex items-start gap-2.5">
                      <Pill tone={runTone(r.status)} className="shrink-0 mt-0.5">{r.status}</Pill>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-[var(--text-2)] truncate" title={r.title}>{r.title}</div>
                        <div className="num text-[10px] text-[var(--text-3)] mt-0.5 flex flex-wrap gap-x-2">
                          <span>{r.kind}</span>
                          <span>{timeAgo(r.createdAt)}</span>
                          {dur(r.durationMs) && <span>{dur(r.durationMs)}</span>}
                          {r.costUsd != null && <span>${r.costUsd.toFixed(4)}</span>}
                          {r.model && <span>{r.model}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12.5px] text-[var(--text-3)] py-6 text-center">No runs yet</div>
              )}
            </Panel>
          </div>

          {/* 4 — Context: standing notes, not a decision; must not outrank approvals */}
          <div>
            <SectionHeader
              label="Context"
              action={
                <button onClick={() => setEditing(true)}
                  className="text-[11.5px] text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
                  Edit
                </button>
              }
            />
            <Panel className="p-4">
              {c?.contextNotes
                ? <div className={open ? "" : "max-h-44 overflow-hidden relative"}>
                    <Markdown>{c.contextNotes}</Markdown>
                  </div>
                : <div className="text-[12.5px] text-[var(--text-3)] py-4 text-center">
                    No context yet — add briefs, standing instructions or links.
                  </div>}
            </Panel>
            {c?.contextNotes && c.contextNotes.length > 400 && (
              <button onClick={() => setOpen(v => !v)} className="mt-1.5 text-[11.5px] text-[var(--text-3)] hover:text-[var(--text)]">
                {open ? "Show less" : "Show more"}
              </button>
            )}
          </div>

          {/* 3 — Tasks: hidden entirely when the board is empty */}
          {(data?.tasks.length ?? 0) > 0 && (
            <div>
              <SectionHeader label="Tasks" />
              <Panel className="p-4">
                <div className="flex gap-2 mb-3">
                  {["todo", "doing", "done"].map((s) => (
                    <Pill key={s} tone={s === "done" ? "up" : s === "doing" ? "accent" : "neutral"}>
                      {tasksByStatus[s] || 0} {s}
                    </Pill>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {data!.tasks.slice(0, 8).map((t) => (
                    <div key={t.id} className="text-[12.5px] text-[var(--text-2)] truncate" title={t.title}>· {t.title}</div>
                  ))}
                </div>
              </Panel>
            </div>
          )}
        </div>
      </div>

      {editing && c && (
        <ClientEditor mode="edit" initial={c} onClose={() => setEditing(false)} onSaved={load} />
      )}
    </div>
  );
}
