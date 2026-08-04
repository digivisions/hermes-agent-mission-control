"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Wallet, Pencil, Plus } from "lucide-react";
import { Eyebrow, Panel, Pill, Button } from "@/components/ui/kit";
import { Sparkline } from "@/components/sparkline";
import { timeAgo } from "@/components/approval-card";
import { plainPreview } from "@/components/markdown";
import { ClientEditor } from "@/components/client-editor";
import type { DocRef } from "@/components/documents-field";

interface KlailyData {
  month: string; revenue: number | null; orders: number | null; note: string;
  source: string; palmstreetYearly: string | null; vaultUpdated: string | null;
}

interface ClientCard {
  slug: string;
  name: string;
  type: string;
  hermesProfile: string | null;
  model: string;
  status: string;
  accent: string | null;
  description: string | null;
  contextNotes: string | null;
  documents: DocRef[] | null;
  pendingApprovals: number;
  lastMessage: { role: string; snippet: string; createdAt: string } | null;
  sparkline: number[];
}

const clientStatusTone: Record<string, "up" | "warn" | "down" | "neutral" | "accent"> = {
  active: "up", unconfigured: "neutral", archived: "neutral",
};

type EditorState = { mode: "create" } | { mode: "edit"; client: ClientCard };

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientCard[]>([]);
  const [klaily, setKlaily] = useState<KlailyData | null>(null);
  const [revInput, setRevInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const load = useCallback(() => {
    fetch("/api/clients").then(r => r.ok ? r.json() : null).then(d => { if (d?.clients) setClients(d.clients); }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    fetch("/api/klaily/revenue").then(r => r.ok ? r.json() : null).then(d => { if (d) setKlaily(d); }).catch(() => {});
  }, [load]);

  const saveRevenue = async () => {
    const v = Number(revInput);
    if (!v || Number.isNaN(v)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/klaily/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenue: v }),
      });
      if (res.ok) {
        const d = await res.json();
        setKlaily(d.data);
        setRevInput("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="pt-4 pb-8 flex items-end justify-between">
        <div>
          <div className="eyebrow mb-2.5">Digital Visions</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--hq-text)]">Clients</h1>
        </div>
        <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
          <Plus className="w-3.5 h-3.5" /> New client
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {clients.map((c) => {
          const live = c.status === "active" && !!c.hermesProfile;
          const accent = c.accent ?? "#94a3b8";
          return (
            <Panel key={c.slug} href={`/clients/${c.slug}`} interactive className="h-full flex flex-col p-6">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-[var(--r-md)] flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, " + accent + " 15%, transparent)", color: accent }}>
                  <Briefcase className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: live ? "var(--hq-up)" : "var(--hq-warn)" }} />
                    <h3 className="text-[15px] font-semibold text-[var(--hq-text)] truncate">{c.name}</h3>
                  </div>
                  <div className="eyebrow !text-[9px] !text-[var(--hq-text-faint)]">{c.type}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.pendingApprovals > 0 && <Pill tone="warn">{c.pendingApprovals} pending</Pill>}
                  {c.documents && c.documents.length > 0 && (
                    <Pill tone="neutral">📎 {c.documents.length} hồ sơ</Pill>
                  )}
                  <Pill tone={clientStatusTone[c.status] ?? "neutral"}>{c.status}</Pill>
                  <button
                    aria-label={`Edit ${c.name}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditor({ mode: "edit", client: c }); }}
                    className="p-1 rounded text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {c.description && <p className="text-[12.5px] text-[var(--hq-text-2)] leading-relaxed">{c.description}</p>}

              {c.contextNotes && (
                <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]">
                  <Eyebrow className="!text-[9px]">Context</Eyebrow>
                  <p className="mt-1 text-[11.5px] text-[var(--text-3)] leading-relaxed line-clamp-2">
                    {plainPreview(c.contextNotes, 180)}
                  </p>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-[var(--hq-hairline)]">
                <Eyebrow className="!text-[9.5px] mb-1.5">activity · 14d</Eyebrow>
                <Sparkline data={c.sparkline} idSeed={c.slug} area color={c.accent ?? undefined} />
              </div>

              <div className="mt-3 text-[12px] text-[var(--hq-text-2)]">
                {c.lastMessage ? (
                  <div className="flex items-start gap-1.5">
                    <span className="truncate flex-1" title={c.lastMessage.snippet}>{c.lastMessage.snippet}</span>
                    <span className="num text-[10.5px] text-[var(--hq-text-faint)] shrink-0">{timeAgo(c.lastMessage.createdAt)}</span>
                  </div>
                ) : (
                  <span className="text-[var(--hq-text-faint)]">No messages yet</span>
                )}
              </div>

              {c.slug === "klaily" && (
                <div className="mt-4 pt-3 border-t border-[var(--hq-hairline)]" onClick={(e) => e.preventDefault()}>
                  <div className="flex items-center justify-between mb-2">
                    <Eyebrow className="!text-[9.5px]">This month · {klaily?.month || "—"}</Eyebrow>
                    <Wallet className="w-3.5 h-3.5 text-[var(--hq-text-ghost)]" />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="num font-semibold text-[26px] leading-none text-[var(--hq-text)]">
                      {klaily?.revenue === null || klaily?.revenue === undefined ? "—" : `$${klaily.revenue.toLocaleString("en-US")}`}
                    </span>
                    {klaily?.orders !== null && klaily?.orders !== undefined && (
                      <span className="num text-[11.5px] text-[var(--hq-text-ghost)] mb-0.5">{klaily.orders} orders</span>
                    )}
                  </div>
                  {klaily?.palmstreetYearly && (
                    <div className="num text-[10.5px] text-[var(--hq-text-faint)] mt-1.5">Palmstreet ~${klaily.palmstreetYearly}/yr (vault)</div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <input
                      value={revInput}
                      onChange={e => setRevInput(e.target.value)}
                      placeholder="Monthly revenue $"
                      className="flex-1 min-w-0 rounded-lg border border-[var(--hq-hairline)] bg-[rgba(58,80,107,0.045)] px-3 py-1.5 text-[12.5px] text-[var(--hq-text)] outline-none focus:border-[var(--hq-accent)]"
                    />
                    <Button onClick={saveRevenue} disabled={saving} size="sm">
                      <Pencil className="w-3.5 h-3.5" /> {saving ? "Saving" : "Save"}
                    </Button>
                  </div>
                  <div className="num text-[10px] text-[var(--hq-text-faint)] mt-2">Stored in dashboard DB — not written to the vault.</div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {editor && (
        <ClientEditor
          mode={editor.mode}
          initial={editor.mode === "edit" ? editor.client : undefined}
          onSaved={load}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
