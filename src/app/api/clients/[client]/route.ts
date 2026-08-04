import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * One payload for the whole workspace right rail. Four queries, one round
 * trip — the page polls this alongside the chat, so fanning out fetches would
 * triple the request count for no benefit at one user.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ client: string }> }
) {
  const { client: slug } = await params;

  const client = await prisma.client.findUnique({ where: { slug } });
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const profile = client.hermesProfile ?? slug;

  const [approvals, runs, tasks] = await Promise.all([
    prisma.agentRequest.findMany({
      where: { profile, status: "awaiting_approval" },
      orderBy: { createdAt: "desc" }, take: 20,
    }),
    prisma.agentRequest.findMany({
      where: { profile }, orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, kind: true, title: true, status: true, model: true,
                durationMs: true, costUsd: true, createdAt: true, error: true },
    }),
    // HermesTask has no client column; the board slug is the per-client
    // convention. An empty result is honest — Phase 6 is where per-client
    // boards actually get created.
    prisma.hermesTask.findMany({
      where: { board: slug },
      orderBy: [{ status: "asc" }, { priority: "desc" }], take: 25,
      select: { id: true, title: true, status: true, priority: true },
    }),
  ]);

  return NextResponse.json({ client, approvals, runs, tasks });
}
