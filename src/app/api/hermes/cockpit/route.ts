import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DAYS = 14;

/**
 * Everything rows 1-2 of the dashboard need, in one payload. Throughput is
 * bucketed in SQL — pulling 14 days of rows into JS to group them works today
 * and stops working the moment volume grows.
 */
export async function GET() {
  const [counts, series, heartbeat, openTasks, cost] = await Promise.all([
    prisma.$queryRaw<{ pending: bigint; active: bigint; failed24h: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'awaiting_approval')              AS pending,
        COUNT(*) FILTER (WHERE status IN ('running','queued','approved')) AS active,
        COUNT(*) FILTER (WHERE status = 'failed'
                           AND "createdAt" > now() - interval '24 hours') AS failed24h
      FROM "AgentRequest"`,
    prisma.$queryRaw<{ day: Date; done: bigint; failed: bigint; rejected: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) FILTER (WHERE status = 'done')     AS done,
             COUNT(*) FILTER (WHERE status = 'failed')   AS failed,
             COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
        FROM "AgentRequest"
       WHERE "createdAt" > now() - interval '14 days'
       GROUP BY 1 ORDER BY 1 ASC`,
    prisma.dataStore.findUnique({ where: { key: "bridge-heartbeat" } }),
    prisma.hermesTask.count({ where: { status: { in: ["todo", "doing", "ready"] } } }),
    prisma.$queryRaw<{ spend: number | null }[]>`
      SELECT COALESCE(SUM("costUsd"), 0)::float AS spend
        FROM "AgentRequest"
       WHERE "createdAt" >= date_trunc('month', now())`,
  ]);

  // Fill missing days so the x-axis is a continuous 14 days.
  const byDay = new Map(series.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const throughput = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.now() - (DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    return {
      day: d,
      label: new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      done: Number(r?.done ?? 0), failed: Number(r?.failed ?? 0), rejected: Number(r?.rejected ?? 0),
    };
  });

  // Bridge alive? The heartbeat row is written every 30s (SPEC A, A-7), so 90s
  // of silence is the alert — not a hardcoded zero.
  const hb = heartbeat?.data as { lastSeen?: string } | undefined;
  const lastSeenMs = hb?.lastSeen ? new Date(hb.lastSeen).getTime() : null;
  const bridgeStale = lastSeenMs == null || Date.now() - lastSeenMs > 90_000;

  return NextResponse.json({
    tiles: {
      pendingApprovals: Number(counts[0]?.pending   ?? 0),
      activeRuns:       Number(counts[0]?.active    ?? 0),
      infraAlerts:      bridgeStale ? 1 : 0,
      openTasks,
      spendMonthUsd:    cost[0]?.spend ?? 0,
      failed24h:        Number(counts[0]?.failed24h ?? 0),
    },
    bridge: { stale: bridgeStale, lastSeen: hb?.lastSeen ?? null },
    throughput,
  });
}
