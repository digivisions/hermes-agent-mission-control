import { prisma } from "@/lib/prisma";
import {
  SLUG_RE, PROJECT_STATUSES, PROJECT_TYPES, PRIORITIES, HEX_RE,
  normText, normList, badRequest, type Fail,
} from "@/lib/registry";

export const dynamic = "force-dynamic";

/** Archived projects are hidden by default; ?all=1 includes them (the edit
 *  modal needs to reach one to un-archive it). */
export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const projects = await prisma.project.findMany({
    where: all ? {} : { status: { not: "archived" } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return Response.json({ projects, count: projects.length });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest([{ field: "_", message: "body must be JSON" }]);

  const errors: Fail[] = [];
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  if (!SLUG_RE.test(slug)) errors.push({ field: "slug", message: "lowercase letters, digits and hyphens; 2-48 chars" });
  if (!name) errors.push({ field: "name", message: "required" });

  const status   = String(body.status   ?? "planned");
  const priority = String(body.priority ?? "medium");
  const type     = String(body.type     ?? "internal");
  if (!PROJECT_STATUSES.includes(status as never)) errors.push({ field: "status", message: `one of ${PROJECT_STATUSES.join(", ")}` });
  if (!PRIORITIES.includes(priority as never))     errors.push({ field: "priority", message: `one of ${PRIORITIES.join(", ")}` });
  if (!PROJECT_TYPES.includes(type as never))      errors.push({ field: "type", message: `one of ${PROJECT_TYPES.join(", ")}` });

  const accent = normText(body.accent);
  if (accent && !HEX_RE.test(accent)) errors.push({ field: "accent", message: "hex colour, e.g. #60a5fa" });
  if (errors.length) return badRequest(errors);

  // New projects land at the top of the board — that's why he just made one.
  const min = await prisma.project.aggregate({ _min: { sortOrder: true } });
  try {
    const project = await prisma.project.create({
      data: {
        slug, name, type, status, priority, accent,
        sortOrder:    (min._min.sortOrder ?? 0) - 1,
        tags:         normList(body.tags),
        nextActions:  normList(body.nextActions),
        waitingOn:    normList(body.waitingOn),
        overview:     normText(body.overview),
        location:     normText(body.location),
        description:  normText(body.description),
        contextNotes: normText(body.contextNotes),
      },
    });
    return Response.json({ project }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return Response.json({ error: "conflict", errors: [{ field: "slug", message: `'${slug}' already exists` }] }, { status: 409 });
    throw e;
  }
}

/** Collection-level reorder: { order: ["slug-a", "slug-b", ...] }.
 *  One request per drop; sortOrder is the array index. Slugs not present are
 *  left alone (archived projects aren't on the board). */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const order: string[] | null = Array.isArray(body?.order) ? body.order.map((s: unknown) => String(s)) : null;
  if (!order) return badRequest([{ field: "order", message: "expected string[]" }]);
  if (order.length > 200) return badRequest([{ field: "order", message: "too many entries" }]);

  await prisma.$transaction(
    order.map((slug, i) => prisma.project.updateMany({ where: { slug }, data: { sortOrder: i } }))
  );
  return Response.json({ ok: true, reordered: order.length });
}
