import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { triggerWebhooks } from "@/lib/webhooks";
import { deleteGoogleCalendarEvent } from "@/lib/google-calendar";
import { deleteAppleCalendarEvent } from "@/lib/apple-calendar";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

function parseCalendarEventIds(calendarEventId: string | null) {
  if (!calendarEventId) return { google: null, apple: null };
  const parts = calendarEventId.split(";");
  let google: string | null = null;
  let apple: string | null = null;
  for (const part of parts) {
    if (part.startsWith("google:")) google = part.slice(7);
    if (part.startsWith("apple:")) apple = part.slice(6);
  }
  return { google, apple };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const booking = await prisma.booking.findUnique({
    where: { cancelToken: params.token },
    include: { eventType: true, user: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });

  // Sync cancellation to external calendars
  const extIds = parseCalendarEventIds(booking.calendarEventId);
  if (extIds.google) {
    await deleteGoogleCalendarEvent(booking.userId, extIds.google);
  }
  if (extIds.apple) {
    await deleteAppleCalendarEvent(booking.userId, extIds.apple);
  }

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
