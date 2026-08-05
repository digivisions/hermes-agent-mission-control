"use client";

/* ───────────────────────────────────────────────────────────
   DigivisionsHQ · Claude Code usage gauge (Spec G, G-6)
   Renders the `claude-usage` DataStore row via
   GET /api/hermes/claude-usage. Percent → window → reset time is
   the vocabulary (G-D2/G-R4) — this card never renders a raw token
   count. Staleness is rendered, not hidden: a degraded read still
   shows the last known bar, with its age and a "dữ liệu cũ" pill.
   ─────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Panel, SectionHeader, Pill, EmptyState, Skeleton, rise } from "@/components/ui/kit";

interface UsagePayload {
  fetchedAt: string | null;
  source: string;
  parserV: number;
  pct: number | null;
  windowHours: number | null;
  resetsAt: string | null;
  lastCostUsd: number | null;
  lastRunAt: string | null;
  rawNote: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  statusNote?: string | null;
}
interface CostsPayload {
  deepseekTodayUsd: number;
  ccTodayUsd: number;
  deepseek7dUsd: number;
  cc7dUsd: number;
}

// ICT = UTC+7, no DST, explicit offset arithmetic through getUTC* — never
// getHours(), the maybeDailyBrief() bug this repeats the fix for (Spec F §1.2).
function ictHHMM(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + 420 * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function ageText(iso: string | null | undefined, prefix = "cập nhật"): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return `${prefix} vừa xong`;
  if (m < 60) return `${prefix} ${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${prefix} ${h} giờ trước`;
  return `${prefix} ${Math.floor(h / 24)} ngày trước`;
}

function barColor(pct: number): string {
  if (pct >= 90) return "var(--hq-down)";
  if (pct >= 75) return "var(--hq-warn)";
  return "var(--accent)";
}

function money(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ClaudeUsageCard() {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/hermes/claude-usage");
        if (res.status === 204) {
          if (!cancelled) { setUsage(null); setCosts(null); }
        } else if (res.ok) {
          const d = await res.json();
          if (!cancelled) { setUsage(d.usage ?? null); setCosts(d.costs ?? null); }
        }
        // any other status: keep the last known state rather than blanking the card
      } catch { /* network hiccup — keep last known state */ }
      if (!cancelled) setLoaded(true);
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return (
    <Panel className="p-6 mb-6 hq-rise" style={rise(11)}>
      <SectionHeader label="Claude Code" title="Usage" />
      {!loaded ? (
        <div className="space-y-3">
          <Skeleton className="h-2.5" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      ) : !usage || usage.pct == null ? (
        // No number to draw yet. Say WHY — the bridge now records the reason
        // and the moment it last tried, so this stops being a dead end that
        // only `pm2 logs` can explain.
        <EmptyState
          title="Chưa lấy được usage"
          hint={[
            usage?.statusNote ||
              (usage?.lastError ? `Bridge báo: ${usage.lastError}` : null) ||
              "Bridge chưa gửi số liệu nào. Kiểm tra: pm2 logs hermes-bridge | grep cc-usage",
            ageText(usage?.lastAttemptAt, "thử lần cuối"),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ) : (
        (() => {
          const pct = Math.max(0, Math.min(100, usage.pct as number));
          const stale = usage.source === "unavailable";
          const resetHHMM = ictHHMM(usage.resetsAt);
          const age = ageText(usage.fetchedAt);
          const attemptAge = ageText(usage.lastAttemptAt, "thử lần cuối");
          const windowLabel = usage.windowHours === 5 ? "5h luân phiên" : "7 ngày";
          return (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="num text-[13px] font-semibold text-[var(--hq-text)]">{pct}%</span>
                {stale && <Pill tone="warn">dữ liệu cũ</Pill>}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--hq-hairline)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: barColor(pct) }}
                />
              </div>
              <div className="mt-2 text-[12px] text-[var(--hq-text-2)]">
                {pct}% · {windowLabel}
              </div>
              {resetHHMM && (
                <div className="num text-[11.5px] text-[var(--hq-text-ghost)] mt-0.5">Reset lúc {resetHHMM} ICT</div>
              )}
              {(age || attemptAge) && (
                <div className="num text-[10px] text-[var(--hq-text-faint)] mt-1">
                  {[age, stale ? attemptAge : null].filter(Boolean).join(" · ")}
                </div>
              )}
              {/* Why the bar is frozen, in words — shown ABOVE the raw
                  breadcrumb because a stale `rawNote` alone (e.g. an hours-old
                  "rate_limit") explained the wrong thing entirely. */}
              {stale && usage.statusNote && (
                <div className="text-[11.5px] mt-2" style={{ color: "var(--hq-warn)" }}>{usage.statusNote}</div>
              )}
              {usage.rawNote && (
                <div className="text-[11.5px] mt-2" style={{ color: "var(--hq-warn)" }}>{usage.rawNote}</div>
              )}
              <div className="num mt-3 pt-3 border-t border-[var(--hq-hairline)] text-[11.5px] text-[var(--hq-text-2)]">
                Hôm nay · DeepSeek {money(costs?.deepseekTodayUsd)} · Claude Code {money(costs?.ccTodayUsd)}
              </div>
              <a
                href="https://claude.ai/settings/usage"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-[11.5px] font-medium"
                style={{ color: "var(--accent)" }}
              >
                Xem chi tiết ↗
              </a>
            </>
          );
        })()
      )}
    </Panel>
  );
}
