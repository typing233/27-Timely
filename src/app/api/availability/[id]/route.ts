import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rule = await prisma.availabilityRule.findFirst({
    where: { id: params.id, userId: payload.userId },
  });
  if (!rule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.availabilityRule.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
