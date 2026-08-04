import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Spec G, G-5: a thin projection over the `claude-usage` DataStore row the
// bridge writes (ccUsageTick(), hermes-bridge/bridge.mjs) plus live cost
// sums. Never echoes anything beyond this shape — it is a projection, not a
// passthrough (G-R5: the row can carry a rawNote and must stay a short
// derived string only).
//
// Auth deviation from the spec draft: every other /api/hermes/* route (see
// health, cost, infra, cockpit, crons, ...) carries NO per-route secret
// check — src/middleware.ts already gates the whole /api/* surface (matcher
// excludes only _next/static, _next/image, favicon.ico, digivisions-) behind
// a valid NextAuth session OR the x-internal-secret header. Adding a route
// -level check that accepts ONLY the header, as the spec draft describes,
// would 401 the browser polling card this route exists to serve (G-6) even
// though middleware already authenticated that session. This route matches
// its actual siblings instead: unauthenticated requests never reach here.
export const dynamic = "force-dynamic";

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: "claude-usage" } });
  if (!row?.data) return new NextResponse(null, { status: 204 });

  const usage = row.data as {
    fetchedAt: string | null;
    source: string;
    parserV: number;
    pct: number | null;
    windowHours: number | null;
    resetsAt: string | null;
    lastCostUsd: number | null;
    lastRunAt: string | null;
    rawNote: string | null;
  };

  const costs = await prisma.$queryRaw<
    { deepseekTodayUsd: number; ccTodayUsd: number; deepseek7dUsd: number; cc7dUsd: number }[]
  >`
    SELECT
      COALESCE(SUM("costUsd") FILTER (
        WHERE kind <> 'claude-code'
          AND "createdAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
      ), 0)::float AS "deepseekTodayUsd",
      COALESCE(SUM("costUsd") FILTER (
        WHERE kind = 'claude-code'
          AND "createdAt" >= date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
      ), 0)::float AS "ccTodayUsd",
      COALESCE(SUM("costUsd") FILTER (
        WHERE kind <> 'claude-code' AND "createdAt" >= now() - interval '7 days'
      ), 0)::float AS "deepseek7dUsd",
      COALESCE(SUM("costUsd") FILTER (
        WHERE kind = 'claude-code' AND "createdAt" >= now() - interval '7 days'
      ), 0)::float AS "cc7dUsd"
    FROM "AgentRequest"
    WHERE "costUsd" IS NOT NULL
  `;

  return NextResponse.json({
    usage,
    costs: costs[0] ?? { deepseekTodayUsd: 0, ccTodayUsd: 0, deepseek7dUsd: 0, cc7dUsd: 0 },
  });
}
