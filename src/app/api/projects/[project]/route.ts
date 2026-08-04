import { prisma } from "@/lib/prisma";
import {
  PROJECT_STATUSES, PROJECT_TYPES, PRIORITIES, HEX_RE,
  pick, normText, normList, badRequest, type Fail,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

const PROJECT_PATCHABLE = [
  "name", "type", "status", "priority", "tags", "overview", "nextActions",
  "waitingOn", "location", "accent", "description", "contextNotes",
] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return Response.json({ error: "not_found", slug }, { status: 404 });
  return Response.json({ project });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest([{ field: "_", message: "body must be JSON" }]);

  const patch = pick<Record<string, unknown>>(body, PROJECT_PATCHABLE);
  const errors: Fail[] = [];
  if ("name" in patch && !String(patch.name ?? "").trim()) errors.push({ field: "name", message: "required" });
  if ("status" in patch && !PROJECT_STATUSES.includes(String(patch.status) as never))
    errors.push({ field: "status", message: `one of ${PROJECT_STATUSES.join(", ")}` });
  if ("priority" in patch && !PRIORITIES.includes(String(patch.priority) as never))
    errors.push({ field: "priority", message: `one of ${PRIORITIES.join(", ")}` });
  if ("type" in patch && !PROJECT_TYPES.includes(String(patch.type) as never))
    errors.push({ field: "type", message: `one of ${PROJECT_TYPES.join(", ")}` });
  if ("accent" in patch && normText(patch.accent) && !HEX_RE.test(normText(patch.accent)!))
    errors.push({ field: "accent", message: "hex colour, e.g. #60a5fa" });
  if (errors.length) return badRequest(errors);

  const data: Record<string, unknown> = {};
  if ("name" in patch)         data.name         = String(patch.name).trim();
  if ("type" in patch)         data.type         = String(patch.type);
  if ("status" in patch)       data.status       = String(patch.status);
  if ("priority" in patch)     data.priority     = String(patch.priority);
  if ("tags" in patch)         data.tags         = normList(patch.tags);
  if ("nextActions" in patch)  data.nextActions  = normList(patch.nextActions);
  if ("waitingOn" in patch)    data.waitingOn    = normList(patch.waitingOn);
  if ("overview" in patch)     data.overview     = normText(patch.overview);
  if ("location" in patch)     data.location     = normText(patch.location);
  if ("accent" in patch)       data.accent       = normText(patch.accent);
  if ("description" in patch)  data.description  = normText(patch.description);
  if ("contextNotes" in patch) data.contextNotes = normText(patch.contextNotes);

  try {
    const project = await prisma.project.update({ where: { slug }, data });
    return Response.json({ project });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025")
      return Response.json({ error: "not_found", slug }, { status: 404 });
    throw e;
  }
}
