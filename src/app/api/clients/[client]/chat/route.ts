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
        select: { id: true, status: true, startedAt: true, error: true },
      })
    : [];
  const byId = new Map(requests.map((r) => [r.id, r]));

  return NextResponse.json({
    messages: messages.map((m) => {
      const req = m.requestId ? byId.get(m.requestId) : undefined;
      return {
        ...m,
        requestStatus:    req?.status    ?? null,
        requestStartedAt: req?.startedAt ?? null,
        requestError:     req?.error     ?? null,
      };
    }),
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

  // The bridge will happily `hermes --profile <anything>`. Validate the slug
  // against the registry so a typo'd or hostile route param can never spawn
  // a run against a profile that isn't ours.
  const registered = await prisma.client.findUnique({ where: { slug: client } });
  if (!registered) {
    return NextResponse.json({ ok: false, error: `unknown client '${client}'` }, { status: 404 });
  }
  if (!registered.hermesProfile) {
    return NextResponse.json(
      { ok: false, error: `client '${client}' has no Hermes profile — run scripts/provision-profile.sh ${client}` },
      { status: 409 }
    );
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
      profile: registered.hermesProfile,
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
