import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, clients] = await Promise.all([
    prisma.agentRequest.findMany({
      where: { status: "awaiting_approval" },
      orderBy: { createdAt: "asc" },   // oldest first: closest to expiry
      take: 100,
    }),
    prisma.client.findMany({ select: { slug: true, name: true, accent: true, hermesProfile: true } }),
  ]);

  const byProfile = new Map<string, { slug: string; name: string; accent: string | null }>();
  for (const c of clients) {
    const badge = { slug: c.slug, name: c.name, accent: c.accent };
    byProfile.set(c.slug, badge);
    if (c.hermesProfile) byProfile.set(c.hermesProfile, badge);   // profile alias wins nothing; both map to the same badge
  }

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, client: r.profile ? byProfile.get(r.profile) ?? null : null })),
    count: rows.length,
  });
}
