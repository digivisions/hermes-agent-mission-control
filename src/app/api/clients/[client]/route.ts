import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CLIENT_STATUSES, CLIENT_TYPES, HEX_RE,
  pick, normText, normDocuments, badRequest, type Fail,
} from "@/lib/registry";

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

const CLIENT_PATCHABLE = [
  "name", "type", "status", "description", "accent", "contextNotes", "hermesProfile", "model", "documents",
] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ client: string }> }) {
  const { client: slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest([{ field: "_", message: "body must be JSON" }]);

  const patch = pick<Record<string, unknown>>(body, CLIENT_PATCHABLE);
  const errors: Fail[] = [];

  if ("name" in patch && !String(patch.name ?? "").trim()) errors.push({ field: "name", message: "required" });
  if ("type" in patch && !CLIENT_TYPES.includes(String(patch.type) as never))
    errors.push({ field: "type", message: `one of ${CLIENT_TYPES.join(", ")}` });
  if ("status" in patch && !CLIENT_STATUSES.includes(String(patch.status) as never))
    errors.push({ field: "status", message: `one of ${CLIENT_STATUSES.join(", ")}` });
  if ("accent" in patch && normText(patch.accent) && !HEX_RE.test(normText(patch.accent)!))
    errors.push({ field: "accent", message: "hex colour, e.g. #34d399" });
  if ("model" in patch && !normText(patch.model)) errors.push({ field: "model", message: "cannot be empty" });
  const docs = "documents" in patch ? normDocuments(patch.documents) : null;
  if (docs?.error) errors.push(docs.error);
  if (errors.length) return badRequest(errors);

  // slug is immutable: it is ChatMessage.client and AgentRequest.profile.
  // Renaming it would orphan every message and run for that client.
  const data: Record<string, unknown> = {};
  if ("name" in patch)          data.name          = String(patch.name).trim();
  if ("type" in patch)          data.type          = String(patch.type);
  if ("status" in patch)        data.status        = String(patch.status);
  if ("model" in patch)         data.model         = normText(patch.model);
  if ("description" in patch)   data.description   = normText(patch.description);
  if ("accent" in patch)        data.accent        = normText(patch.accent);
  if ("contextNotes" in patch)  data.contextNotes  = normText(patch.contextNotes);
  if ("hermesProfile" in patch) data.hermesProfile = normText(patch.hermesProfile);
  if ("documents" in patch)     data.documents     = docs!.value;

  try {
    const client = await prisma.client.update({ where: { slug }, data });
    return Response.json({ client });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025")
      return Response.json({ error: "not_found", slug }, { status: 404 });
    throw e;
  }
}
