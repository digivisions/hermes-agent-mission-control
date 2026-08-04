import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: "infra-health" } });
  if (!row?.data) return NextResponse.json({ error: "no data" }, { status: 404 });
  return NextResponse.json(row.data);
}
