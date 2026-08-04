import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const clients = await prisma.client.findMany({
    where: { status: { not: "archived" } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ clients });
}
