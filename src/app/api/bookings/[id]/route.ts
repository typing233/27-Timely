import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { triggerWebhooks } from "@/lib/webhooks";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, userId: payload.userId },
    include: { eventType: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(booking);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const booking = await prisma.booking.findFirst({
    where: { id: params.id, userId: payload.userId },
    include: { eventType: true, user: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.status === "CANCELLED") {
    const updated = await prisma.booking.update({
      where: { id: params.id },
      data: { status: "CANCELLED" },
    });

    const zonedStart = toZonedTime(booking.startTime, booking.timezone);
    const emailData = {
      hostName: booking.user.name,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      eventName: booking.eventType.name,
      startTime: format(zonedStart, "HH:mm"),
      endTime: format(toZonedTime(booking.endTime, booking.timezone), "HH:mm"),
      date: format(zonedStart, "EEEE, MMMM d, yyyy"),
      timezone: booking.timezone,
    };

    await Promise.allSettled([
      sendEmail(booking.user.email, "BOOKING_CANCELLATION_HOST", booking.userId, emailData),
      sendEmail(booking.guestEmail, "BOOKING_CANCELLATION_GUEST", booking.userId, emailData),
    ]);

    await triggerWebhooks(booking.userId, "booking.cancelled", {
      bookingId: booking.id,
      eventType: booking.eventType.name,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid update" }, { status: 400 });
}
