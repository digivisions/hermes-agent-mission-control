import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RERUNNABLE } from "@/lib/requests";

/** Re-run a dead request as a NEW row. A rerun is not an approval — a
 *  side-effecting rerun lands back in awaiting_approval (Spec D, D10). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if ((b.action || "") !== "rerun")
    return NextResponse.json({ error: "action must be rerun" }, { status: 400 });

  const src = await prisma.agentRequest.findUnique({ where: { id } });
  if (!src) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!RERUNNABLE.has(src.status))
    return NextResponse.json({ error: `cannot rerun a ${src.status} request` }, { status: 409 });

  const created = await prisma.agentRequest.create({
    data: {
      origin: "web", kind: src.kind, title: src.title, prompt: src.prompt,
      profile: src.profile, sideEffecting: src.sideEffecting,
      flagReason: src.flagReason,
      status: src.sideEffecting ? "awaiting_approval" : "queued",
    },
  });

  // Make the rerun visible in the thread it came from, not a ghost run.
  if (src.kind === "chat" && src.profile && src.prompt) {
    const client = await prisma.client.findFirst({
      where: { OR: [{ hermesProfile: src.profile }, { slug: src.profile }] },
      select: { slug: true },
    });
    if (client) {
      await prisma.chatMessage.create({
        data: { client: client.slug, role: "user", content: src.prompt, requestId: created.id },
      });
    }
  }
  return NextResponse.json({ request: created });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = (b.action || "").toString(); // approve | reject | edit
  const existing = await prisma.agentRequest.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!["awaiting_approval", "queued"].includes(existing.status))
    return NextResponse.json({ error: `cannot decide a ${existing.status} request` }, { status: 409 });

  const data: Record<string, unknown> = { decidedAt: new Date() };
  if (action === "approve") data.status = "approved";
  else if (action === "reject") data.status = "rejected";
  else if (action === "edit") { data.status = "approved"; if (b.prompt) data.prompt = b.prompt.toString(); if (b.title) data.title = b.title.toString().slice(0, 200); }
  else return NextResponse.json({ error: "action must be approve|reject|edit" }, { status: 400 });

  const row = await prisma.agentRequest.update({ where: { id }, data });
  return NextResponse.json({ request: row });
}
