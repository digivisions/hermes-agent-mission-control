"use client";

import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { Panel, Pill } from "@/components/ui/kit";

// ── Types ─────────────────────────────────────────────────
export interface Req {
  id: string; origin: string; kind: string; title: string; prompt: string | null;
  sideEffecting: boolean; status: string; result: string | null; error: string | null;
  createdAt: string;
  flagReason?: string | null;
  model?: string | null; costUsd?: number | null; durationMs?: number | null;
  decidedAt?: string | null; startedAt?: string | null; finishedAt?: string | null;
}
export interface ClientBadge { slug: string; name: string; accent?: string | null }

// ── Helpers ───────────────────────────────────────────────
export function timeAgo(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  if (Number.isNaN(diff)) return "—";
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function dur(ms: number | null | undefined) {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Receipt (rich only) ──────────────────────────────────────
function Receipt({ req, onRerun }: { req: Req; onRerun?: () => void }) {
  const rerunBtn = onRerun && (
    <button
      type="button"
      onClick={onRerun}
      className="font-medium underline underline-offset-2 hover:text-[var(--text-2)]"
    >
      Chạy lại
    </button>
  );

  if (req.status === "approved" || req.status === "running") {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
        ⏳ Đã duyệt · đang chạy…
      </div>
    );
  }
  if (req.status === "done") {
    const d = dur(req.durationMs);
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
        ✅ Đã duyệt{d && ` · chạy ${d}`}
        {req.costUsd != null && ` · $${req.costUsd.toFixed(4)}`}
      </div>
    );
  }
  if (req.status === "failed") {
    const err = req.error && req.error.length > 60 ? `${req.error.slice(0, 60)}…` : req.error;
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
        ⚠️ Chạy lỗi{err ? ` · ${err}` : ""} {rerunBtn}
      </div>
    );
  }
  if (req.status === "rejected") {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
        ✕ Đã từ chối {rerunBtn}
      </div>
    );
  }
  if (req.status === "expired") {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--text-3)]">
        ⏰ Hết hạn sau 24h · chưa được duyệt {rerunBtn}
      </div>
    );
  }
  // queued: an unapproved queued row has no approval story
  return null;
}

// ── Card ──────────────────────────────────────────────────
export function ApprovalCard({
  req, variant = "compact", estCostUsd = null, modelHint = null,
  client = null, onAction, onRerun,
}: {
  req: Req;
  variant?: "compact" | "rich";
  estCostUsd?: number | null;   // rich only (D7)
  modelHint?: string | null;    // Client.model, when req.model is not yet resolved
  client?: ClientBadge | null;  // global list badge + deep link (D8)
  onAction: () => void;
  onRerun?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(req.title);
  const [draftPrompt, setDraftPrompt] = useState(req.prompt ?? "");

  if (req.status !== "awaiting_approval") {
    if (variant === "rich") return <Receipt req={req} onRerun={onRerun} />;
    return null;
  }

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/hermes/requests/${req.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // optimistic: card fades, parent refetches
      onAction();
    } catch {
      setBusy(false);
      setEditing(false);
    }
  };

  const pad = variant === "compact" ? "p-4" : "p-5";

  return (
    <Panel className={`${pad} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill tone="neutral">{req.kind}</Pill>
          {client && (
            <Pill tone="accent">
              <a href={`/clients/${client.slug}`}>{client.name}</a>
            </Pill>
          )}
          {req.flagReason ? (
            <span title="Hermes flagged this automatically">
              <Pill tone="warn">⚡ {req.flagReason}</Pill>
            </span>
          ) : (
            req.sideEffecting && <Pill tone="warn">⚡ Hành động</Pill>
          )}
        </div>
        <span className="num text-[10.5px] text-[var(--text-3)] shrink-0 mt-1">
          {timeAgo(req.createdAt)}
        </span>
      </div>

      {editing ? (
        <div className="space-y-2.5">
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="w-full bg-transparent text-[14px] font-medium text-[var(--text)] px-3 py-2 rounded-[8px] border border-[var(--line)] outline-none focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
          />
          <textarea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            rows={variant === "rich" ? 5 : 3}
            className="w-full bg-transparent text-[13px] text-[var(--text-2)] px-3 py-2 rounded-[8px] border border-[var(--line)] outline-none focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] resize-y"
          />
        </div>
      ) : (
        <>
          <h3 className="text-[15px] font-medium text-[var(--text)] leading-snug">
            {req.title}
          </h3>
          {variant === "rich" ? (
            req.prompt && (
              <pre className="mt-2.5 rounded-[8px] p-3 text-[12px] overflow-x-auto whitespace-pre-wrap break-words"
                   style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}>
                {req.prompt ?? req.title}
              </pre>
            )
          ) : (
            req.prompt && (
              <p className="mt-1.5 text-[13px] text-[var(--text-2)] leading-snug line-clamp-2">
                {req.prompt}
              </p>
            )
          )}
          {variant === "rich" && (
            <div className="num text-[10.5px] text-[var(--text-3)] mt-2 flex flex-wrap gap-x-2.5">
              {(req.model ?? modelHint) && <span>{req.model ?? modelHint}</span>}
              {estCostUsd != null && (
                <span title="Median cost of this client's last 20 completed runs">
                  ~${estCostUsd.toFixed(4)} · ước tính
                </span>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex items-center gap-2 mt-4">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() =>
                patch({
                  action: "edit",
                  title: draftTitle.trim(),
                  prompt: draftPrompt,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                color: "var(--accent)",
                border:
                  "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                background: "color-mix(in srgb, var(--accent) 10%, transparent)",
              }}
            >
              <Check className="w-3.5 h-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraftTitle(req.title);
                setDraftPrompt(req.prompt ?? "");
              }}
              className="btn-ghost inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => patch({ action: "approve" })}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
              style={{
                color: "var(--up)",
                border: "1px solid color-mix(in srgb, var(--up) 30%, transparent)",
                background: "color-mix(in srgb, var(--up) 10%, transparent)",
              }}
            >
              <Check className="w-3.5 h-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => patch({ action: "reject" })}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors text-[var(--text-2)] hover:text-[var(--down)]"
              style={{ border: "1px solid var(--line)" }}
            >
              <X className="w-3.5 h-3.5" />
              Reject
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors text-[var(--text-2)] hover:text-[var(--text)]"
              style={{ border: "1px solid var(--line)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}
