import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SLUG_RE, CLIENT_STATUSES, CLIENT_TYPES, HEX_RE, REPO_PATH_RE,
  normText, normDocuments, badRequest, type Fail,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

/** Archived clients are hidden by default; ?all=1 includes them (the edit
 *  modal needs to reach one to un-archive it). */
export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const clients = await prisma.client.findMany({
    where: all ? {} : { status: { not: "archived" } },
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest([{ field: "_", message: "body must be JSON" }]);

  const errors: Fail[] = [];
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  if (!SLUG_RE.test(slug)) errors.push({ field: "slug", message: "lowercase letters, digits and hyphens; 2-48 chars" });
  if (!name) errors.push({ field: "name", message: "required" });

  const type = String(body.type ?? "internal");
  if (!CLIENT_TYPES.includes(type as never)) errors.push({ field: "type", message: `one of ${CLIENT_TYPES.join(", ")}` });

  const status = String(body.status ?? "unconfigured");
  if (!CLIENT_STATUSES.includes(status as never)) errors.push({ field: "status", message: `one of ${CLIENT_STATUSES.join(", ")}` });

  const accent = normText(body.accent);
  if (accent && !HEX_RE.test(accent)) errors.push({ field: "accent", message: "hex colour, e.g. #34d399" });

  const repoPath = normText(body.repoPath);
  if (repoPath && !REPO_PATH_RE.test(repoPath))
    errors.push({ field: "repoPath", message: "absolute path on the Mac, e.g. /Users/annguyen/Claude/Projects/Klaily" });

  const docs = normDocuments(body.documents);
  if (docs.error) errors.push(docs.error);

  if (errors.length) return badRequest(errors);

  try {
    const client = await prisma.client.create({
      data: {
        slug, name, type, status, accent,
        description:  normText(body.description),
        contextNotes: normText(body.contextNotes),
        hermesProfile: normText(body.hermesProfile),
        repoPath,
        documents: docs.value ?? Prisma.JsonNull,
        ...(normText(body.model) ? { model: normText(body.model)! } : {}),
      },
    });
    return Response.json({ client }, { status: 201 });
  } catch (e) {
    // P2002 = unique constraint. slug is the only unique column on Client.
    if ((e as { code?: string }).code === "P2002")
      return Response.json({ error: "conflict", errors: [{ field: "slug", message: `'${slug}' already exists` }] }, { status: 409 });
    throw e;
  }
}
