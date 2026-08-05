import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DASHBOARD_LAYOUT_KEY, normalizeDashboardOrder } from "@/lib/dashboard-layout";

export const dynamic = "force-dynamic";

/** Cockpit panel order. One global row — the dashboard has one operator and
 *  the order is a property of the dashboard, not of a user (D5). Last write
 *  wins (D8). Auth is handled by src/middleware.ts — do not add it here. */
export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: DASHBOARD_LAYOUT_KEY } });
  const stored = (row?.data as { order?: unknown } | null) ?? null;
  return NextResponse.json({
    order: normalizeDashboardOrder(stored?.order),
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray((body as { order?: unknown }).order)) {
    return NextResponse.json({ ok: false, error: "body must be {order: string[]}" }, { status: 400 });
  }

  // normalize, never trust: the stored row is always a complete valid order,
  // so a later GET can hand it straight to the renderer.
  const order = normalizeDashboardOrder((body as { order: unknown }).order);
  const data = { order, updatedAt: new Date().toISOString(), updatedBy: "web" };

  await prisma.dataStore.upsert({
    where:  { key: DASHBOARD_LAYOUT_KEY },
    create: { key: DASHBOARD_LAYOUT_KEY, data },
    update: { data },
  });

  return NextResponse.json({ order });
}
