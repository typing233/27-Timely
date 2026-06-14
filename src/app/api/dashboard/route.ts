import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    todayBookings,
    weekBookings,
    monthBookings,
    upcomingBookings,
    totalEventTypes,
  ] = await Promise.all([
    prisma.booking.count({
      where: { userId: payload.userId, status: "CONFIRMED", startTime: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.booking.count({
      where: { userId: payload.userId, status: "CONFIRMED", startTime: { gte: weekStart, lte: weekEnd } },
    }),
    prisma.booking.count({
      where: { userId: payload.userId, status: "CONFIRMED", startTime: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.booking.findMany({
      where: { userId: payload.userId, status: "CONFIRMED", startTime: { gte: now } },
      include: { eventType: { select: { name: true } } },
      orderBy: { startTime: "asc" },
      take: 5,
    }),
    prisma.eventType.count({ where: { userId: payload.userId } }),
  ]);

  return NextResponse.json({
    stats: {
      todayBookings,
      weekBookings,
      monthBookings,
      totalEventTypes,
    },
    upcomingBookings,
  });
}
