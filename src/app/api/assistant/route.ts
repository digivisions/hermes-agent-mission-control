import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeConfig } from "@/lib/assistant";

export const dynamic = "force-dynamic";

const DIGEST_THROTTLE_MS = 60_000;
const KNOWN_TOP_KEYS = new Set(["enabled", "name", "digest", "nudges", "clients"]);

export async function GET() {
  const [configRow, decisionsRow, logRow] = await Promise.all([
    prisma.dataStore.findUnique({ where: { key: "assistant-config" } }),
    prisma.dataStore.findUnique({ where: { key: "assistant-decisions" } }),
    prisma.dataStore.findUnique({ where: { key: "assistant-digest-log" } }),
  ]);

  const config = normalizeConfig(configRow?.data);
  const decisions = (decisionsRow?.data as { ts?: string; items?: unknown[] } | undefined) ?? { items: [] };
  const rawLog = (logRow?.data as { entries?: Array<Record<string, unknown>> } | undefined) ?? { entries: [] };
  const entries = Array.isArray(rawLog.entries) ? rawLog.entries : [];
  const log = {
    entries: entries.slice(0, 10).map((e) => ({
      ...e,
      text: typeof e.text === "string" ? e.text.slice(0, 400) : e.text,
    })),
  };
  const lastDigestAt = (entries[0]?.ts as string | undefined) ?? null;

  return NextResponse.json({ config, decisions, log, lastDigestAt });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !body.config || typeof body.config !== "object") {
    return NextResponse.json({ ok: false, error: "body must be {config: {...}}" }, { status: 400 });
  }
  const unknownKeys = Object.keys(body.config).filter((k) => !KNOWN_TOP_KEYS.has(k));
  if (unknownKeys.length) {
    return NextResponse.json({ ok: false, error: `unknown config key(s): ${unknownKeys.join(", ")}` }, { status: 400 });
  }

  const normalized = normalizeConfig(body.config);
  const stored = { ...normalized, updatedAt: new Date().toISOString(), updatedBy: "web" };

  await prisma.dataStore.upsert({
    where: { key: "assistant-config" },
    create: { key: "assistant-config", data: stored },
    update: { data: stored },
  });

  return NextResponse.json({ config: normalized });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.action !== "digest") {
    return NextResponse.json({ ok: false, error: "unsupported action" }, { status: 400 });
  }

  // The button is one tap and the bridge polls every 5s — refuse a burst of
  // taps rather than queue a pile of digests that all say the same thing.
  const recent = await prisma.agentRequest.findFirst({
    where: { kind: "digest", createdAt: { gt: new Date(Date.now() - DIGEST_THROTTLE_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json({ ok: false, error: "a digest was already requested in the last 60s" }, { status: 429 });
  }

  const now = new Date();
  const created = await prisma.agentRequest.create({
    data: {
      id: randomUUID(),
      origin: "web",
      kind: "digest",
      title: "Krisna · báo cáo theo yêu cầu",
      prompt: JSON.stringify({ slot: "ondemand" }),
      status: "queued",
      createdAt: now,
      updatedAt: now,
    },
  });

  return NextResponse.json({ requestId: created.id });
}
