import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ client: string }> }
) {
  const { client } = await params;
  const messages = await prisma.chatMessage.findMany({
    where: { client },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, requestId: true, createdAt: true },
  });

  const requestIds = messages
    .map((m) => m.requestId)
    .filter((id): id is string => !!id);
  const requests = requestIds.length
    ? await prisma.agentRequest.findMany({
        where: { id: { in: requestIds } },
        select: { id: true, status: true },
      })
    : [];
  const statusById = new Map(requests.map((r) => [r.id, r.status]));

  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      requestStatus: m.requestId ? statusById.get(m.requestId) ?? null : null,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ client: string }> }
) {
  const { client } = await params;
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const sideEffecting = body?.sideEffecting === true;
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  const chatMessage = await prisma.chatMessage.create({
    data: { client, role: "user", content: message },
  });

  const now = new Date();
  const agentRequest = await prisma.agentRequest.create({
    data: {
      kind: "chat",
      title: message.length > 80 ? `${message.slice(0, 80)}…` : message,
      prompt: message,
      profile: client,
      sideEffecting,
      status: sideEffecting ? "awaiting_approval" : "queued",
      createdAt: now,
      updatedAt: now,
    },
  });

  // Link the user message to its request so GET can surface the live
  // requestStatus (queued/approved/running/awaiting_approval) for typing UX.
  const linked = await prisma.chatMessage.update({
    where: { id: chatMessage.id },
    data: { requestId: agentRequest.id },
  });

  return NextResponse.json({
    ok: true,
    messageId: linked.id,
    requestId: agentRequest.id,
  });
}
