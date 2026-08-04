"use client";

import { useCallback, useEffect, useState } from "react";
import { Eyebrow, EmptyState, Pill } from "@/components/ui/kit";
import { ApprovalCard, type Req, type ClientBadge } from "@/components/approval-card";

interface ApprovalItem extends Req {
  client: ClientBadge | null;
}

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/approvals");
      if (r.ok) {
        const d = await r.json();
        setItems(d.items ?? []);
        setCount(d.count ?? 0);
      }
    } catch { /* ignore — next poll retries */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="hq-rise pt-4 pb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>Across all clients</Eyebrow>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--text)] mt-2">
            Approvals
          </h1>
        </div>
        <Pill tone={count > 0 ? "warn" : "neutral"}>{count} pending</Pill>
      </div>

      <div className="max-w-2xl flex flex-col gap-3">
        {!loaded ? (
          <div className="flex items-center justify-center py-14 text-[var(--text-3)] text-[13px]">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Nothing needs your decision."
            hint="Approval requests from every client land here."
          />
        ) : (
          items.map((it) => (
            <ApprovalCard key={it.id} req={it} client={it.client} onAction={load} />
          ))
        )}
      </div>
    </div>
  );
}
