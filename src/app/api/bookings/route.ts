import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { getAvailableSlots } from "@/lib/availability";
import { sendEmail } from "@/lib/email";
import { triggerWebhooks } from "@/lib/webhooks";
import { createGoogleCalendarEvent } from "@/lib/google-calendar";
import { z } from "zod";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const createBookingSchema = z.object({
  eventTypeId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  guestName: z.string().min(1),
  guestEmail: z.string().email(),
  guestNotes: z.string().optional(),
  timezone: z.string(),
});

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = { userId: payload.userId };
  if (status) where.status = status;
  if (from) where.startTime = { gte: new Date(from) };
  if (to) where.endTime = { ...(where.endTime as object || {}), lte: new Date(to) };

  const bookings = await prisma.booking.findMany({
    where,
    include: { eventType: { select: { name: true, duration: true } } },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json(bookings);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createBookingSchema.parse(body);

    const eventType = await prisma.eventType.findUnique({
      where: { id: data.eventTypeId },
      include: { user: true },
    });

    if (!eventType || !eventType.isActive) {
      return NextResponse.json({ error: "Event type not found" }, { status: 404 });
    }

    const dateStr = format(new Date(data.startTime), "yyyy-MM-dd");
    const slots = await getAvailableSlots(
      eventType.userId,
      eventType.id,
      dateStr,
      data.timezone
    );

    const isValidSlot = slots.some(
      (s) => s.start === data.startTime && s.end === data.endTime
    );

    if (!isValidSlot) {
      return NextResponse.json({ error: "Selected time slot is not available" }, { status: 409 });
    }

    const booking = await prisma.booking.create({
      data: {
        eventTypeId: data.eventTypeId,
        userId: eventType.userId,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        guestNotes: data.guestNotes,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        timezone: data.timezone,
      },
    });

    const zonedStart = toZonedTime(new Date(data.startTime), data.timezone);
    const emailData = {
      hostName: eventType.user.name,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      eventName: eventType.name,
      startTime: format(zonedStart, "HH:mm"),
      endTime: format(toZonedTime(new Date(data.endTime), data.timezone), "HH:mm"),
      date: format(zonedStart, "EEEE, MMMM d, yyyy"),
      timezone: data.timezone,
      cancelUrl: `${process.env.APP_URL || "http://localhost:3000"}/booking/cancel/${booking.cancelToken}`,
      notes: data.guestNotes,
    };

    await Promise.allSettled([
      sendEmail(eventType.user.email, "BOOKING_CONFIRMATION_HOST", eventType.userId, emailData),
      sendEmail(data.guestEmail, "BOOKING_CONFIRMATION_GUEST", eventType.userId, emailData),
    ]);

    await createGoogleCalendarEvent(eventType.userId, {
      summary: `${eventType.name} with ${data.guestName}`,
      description: data.guestNotes,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      attendeeEmail: data.guestEmail,
      timezone: data.timezone,
    });

    await triggerWebhooks(eventType.userId, "booking.created", {
      bookingId: booking.id,
      eventType: eventType.name,
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      startTime: data.startTime,
      endTime: data.endTime,
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    console.error("Booking creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
