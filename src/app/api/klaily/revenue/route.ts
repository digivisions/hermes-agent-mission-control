import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Klaily revenue: reads a DataStore key that can be updated via POST /api/klaily/revenue.
// Falls back to info in the vault note. A Shopify Admin token can be wired later.

interface StoredRevenue {
  month?: string;
  revenue?: number;
  orders?: number;
  note?: string;
  source?: string;
}
export async function GET() {
  let stored: StoredRevenue | null = null;
  try {
    const row = await prisma.dataStore.findUnique({ where: { key: "klaily-revenue" } });
    if (row?.data && typeof row.data === "object" && !Array.isArray(row.data)) {
      stored = row.data as unknown as StoredRevenue;
    }
  } catch {
    /* db down */
  }

  // Vault note fallback info
  let vaultInfo: { palmstreetYearly?: string; updated?: string } = {};
  try {
    const raw = fs.readFileSync(
      path.join(process.env.VAULT_MIRROR_DIR || "/home/andy/vault-mirror", "Projects/Klaily.md"),
      "utf8"
    );
    const m = raw.match(/Palmstreet, ~([^\s)]+)/);
    if (m) vaultInfo.palmstreetYearly = m[1];
    const upd = raw.match(/^updated:\s*(.+)$/m);
    if (upd) vaultInfo.updated = upd[1].trim();
  } catch {
    /* note not synced */
  }

  return NextResponse.json(
    {
      month: stored?.month || new Date().toISOString().slice(0, 7),
      revenue: stored?.revenue ?? null,
      orders: stored?.orders ?? null,
      note: stored?.note || "",
      source: stored?.source || "manual",
      palmstreetYearly: vaultInfo.palmstreetYearly || null,
      vaultUpdated: vaultInfo.updated || null,
    },
    { headers: { "Cache-Control": "no-store, no-cache" } }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { revenue, orders, note, source } = body as {
      revenue?: number;
      orders?: number;
      note?: string;
      source?: string;
    };
    const month = new Date().toISOString().slice(0, 7);
    const data = { month, revenue: revenue ?? null, orders: orders ?? null, note: note || "", source: source || "manual" };
    await prisma.dataStore.upsert({
      where: { key: "klaily-revenue" },
      update: { data },
      create: { key: "klaily-revenue", data },
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
