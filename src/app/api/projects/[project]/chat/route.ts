import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectSideEffect } from "@/lib/requests";
import { REPORT_RE } from "@/lib/assistant";

// ChatMessage has no per-entity-kind column — 'client' is the thread key.
// Client and Project slugs are separate registries and CAN collide (e.g.
// 'immersive-travel-asia' is both a Client and a Project today), so project
// threads are stored under a 'project:' prefix to keep the two conversations
// from merging into one.
function threadKey(project: string) {
  return `project:${project}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string }> }
) {
  const { project } = await params;
  const thread = threadKey(project);
  const messages = await prisma.chatMessage.findMany({
    where: { client: thread },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, requestId: true, createdAt: true },
  });

  const requestIds = messages
    .map((m) => m.requestId)
    .filter((id): id is string => !!id);
  const requests = requestIds.length
    ? await prisma.agentRequest.findMany({
        where: { id: { in: requestIds } },
        select: {
          id: true, origin: true, kind: true, title: true, prompt: true,
          sideEffecting: true, status: true, result: true, error: true,
          flagReason: true, model: true, costUsd: true, durationMs: true,
          decidedAt: true, createdAt: true, startedAt: true, finishedAt: true,
          ccModel: true, repoPath: true,
        },
      })
    : [];
  const byId = new Map(requests.map((r) => [r.id, r]));

  // Median of the project's own last 20 completed runs — the only honest
  // pre-run cost signal (D6). Queried ONLY when a card is actually on screen.
  let estCostUsd: number | null = null;
  if (requests.some((r) => r.status === "awaiting_approval")) {
    const profile = (await prisma.project.findUnique({
      where: { slug: project }, select: { hermesProfile: true },
    }))?.hermesProfile ?? project;
    const rows = await prisma.$queryRaw<{ med: number | null; n: bigint }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "costUsd")::float AS med,
             COUNT(*) AS n
        FROM (SELECT "costUsd" FROM "AgentRequest"
               WHERE profile = ${profile} AND status = 'done' AND "costUsd" IS NOT NULL
               ORDER BY "createdAt" DESC LIMIT 20) t`;
    estCostUsd = Number(rows[0]?.n ?? 0) >= 3 ? (rows[0]?.med ?? null) : null;
  }

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
    requests: Object.fromEntries(requests.map((r) => [r.id, r])),
    estCostUsd,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ project: string }> }
) {
  const { project } = await params;
  const thread = threadKey(project);
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const explicit = body?.sideEffecting === true;          // ⚡ Hành động mode
  // A report is a read-only summary of THIS project's 24h — never triaged (no
  // LLM classification cost), never side-effecting, answered in-thread by the
  // bridge (Spec F, F-7 step 4). ⚡ mode wins: the operator asked for an action
  // explicitly.
  const isReport = !explicit && REPORT_RE.test(message);
  const detected = explicit || isReport ? null : detectSideEffect(message);   // escalate-only (D2)
  const sideEffecting = explicit || detected !== null;
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  // The bridge will happily `hermes --profile <anything>`. Validate the slug
  // against the registry so a typo'd or hostile route param can never spawn
  // a run against a profile that isn't ours. Unlike /api/clients, we don't
  // gate on hermesProfile being set — projects fall back to their own slug
  // as the profile (profiles are being provisioned in parallel; an
  // unprovisioned one just fails the run with a descriptive error).
  const registered = await prisma.project.findUnique({ where: { slug: project } });
  if (!registered) {
    return NextResponse.json({ ok: false, error: `unknown project '${project}'` }, { status: 404 });
  }
  const profile = registered.hermesProfile ?? project;

  const chatMessage = await prisma.chatMessage.create({
    data: { client: thread, role: "user", content: message },
  });

  const now = new Date();
  const agentRequest = await prisma.agentRequest.create({
    data: {
      kind: isReport ? "report" : "chat",
      title: message.length > 80 ? `${message.slice(0, 80)}…` : message,
      prompt: message,
      profile,
      sideEffecting,
      flagReason: detected,
      status: sideEffecting ? "awaiting_approval" : "queued",
      // Belt-and-braces: triageBatch() only selects kind='chat', but the stamp
      // documents intent — a report is classified by the regex, not by an LLM.
      triagedAt: isReport ? now : undefined,
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
