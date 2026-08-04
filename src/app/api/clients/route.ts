import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const clients = await prisma.client.findMany({
    where: { status: { not: "archived" } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const profiles = clients.map((c) => c.hermesProfile ?? c.slug);

  const [pending, lastMsgs, activity] = await Promise.all([
    prisma.agentRequest.groupBy({
      by: ["profile"],
      where: { profile: { in: profiles }, status: "awaiting_approval" },
      _count: { _all: true },
    }),
    // Latest message per client. distinct+orderBy is the cheap way at this row
    // count; revisit if ChatMessage ever gets large.
    prisma.chatMessage.findMany({
      where: { client: { in: clients.map((c) => c.slug) } },
      orderBy: { createdAt: "desc" }, distinct: ["client"],
      select: { client: true, role: true, content: true, createdAt: true },
    }),
    prisma.$queryRaw<{ profile: string; day: Date; n: bigint }[]>`
      SELECT profile, date_trunc('day', "createdAt") AS day, COUNT(*) AS n
        FROM "AgentRequest"
       WHERE profile IS NOT NULL AND "createdAt" > now() - interval '14 days'
       GROUP BY 1, 2`,
  ]);

  const pendingBy = new Map(pending.map((p) => [p.profile ?? "", p._count._all]));
  const msgBy     = new Map(lastMsgs.map((m) => [m.client, m]));
  const actBy     = new Map<string, Map<string, number>>();
  for (const r of activity) {
    if (!actBy.has(r.profile)) actBy.set(r.profile, new Map());
    actBy.get(r.profile)!.set(r.day.toISOString().slice(0, 10), Number(r.n));
  }

  return NextResponse.json({
    clients: clients.map((c) => {
      const key  = c.hermesProfile ?? c.slug;
      const days = actBy.get(key) ?? new Map<string, number>();
      const msg  = msgBy.get(c.slug);
      return {
        ...c,
        pendingApprovals: pendingBy.get(key) ?? 0,
        lastMessage: msg
          ? { role: msg.role, snippet: msg.content.slice(0, 110), createdAt: msg.createdAt }
          : null,
        // Always 14 points so card height never jumps between clients.
        sparkline: Array.from({ length: 14 }, (_, i) =>
          days.get(new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10)) ?? 0),
      };
    }),
  });
}
