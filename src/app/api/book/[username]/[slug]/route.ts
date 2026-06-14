import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/availability";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string; slug: string } }
) {
  const user = await prisma.user.findFirst({
    where: { name: params.username },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const eventType = await prisma.eventType.findFirst({
    where: { userId: user.id, slug: params.slug, isActive: true },
  });

  if (!eventType) {
    return NextResponse.json({ error: "Event type not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const timezone = searchParams.get("timezone") || user.timezone;

  if (date) {
    const slots = await getAvailableSlots(user.id, eventType.id, date, timezone);
    return NextResponse.json({
      eventType: {
        id: eventType.id,
        name: eventType.name,
        description: eventType.description,
        duration: eventType.duration,
      },
      user: { name: user.name, timezone: user.timezone },
      slots,
    });
  }

  return NextResponse.json({
    eventType: {
      id: eventType.id,
      name: eventType.name,
      description: eventType.description,
      duration: eventType.duration,
    },
    user: { name: user.name, timezone: user.timezone },
  });
}
