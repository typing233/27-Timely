import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { triggerWebhooks } from "@/lib/webhooks";
import { getAvailableSlots } from "@/lib/availability";
import { deleteGoogleCalendarEvent, updateGoogleCalendarEvent } from "@/lib/google-calendar";
import { deleteAppleCalendarEvent, updateAppleCalendarEvent } from "@/lib/apple-calendar";
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

  // --- Cancel ---
  if (body.status === "CANCELLED") {
    const updated = await prisma.booking.update({
      where: { id: params.id },
      data: { status: "CANCELLED" },
    });

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

  // --- Reschedule ---
  if (body.startTime && body.endTime) {
    if (booking.status !== "CONFIRMED") {
      return NextResponse.json({ error: "Only confirmed bookings can be rescheduled" }, { status: 400 });
    }

    const newStart = new Date(body.startTime);
    const newEnd = new Date(body.endTime);
    const tz = body.timezone || booking.timezone;

    // Validate the new time slot is available (temporarily exclude this booking from conflicts)
    const dateStr = format(newStart, "yyyy-MM-dd");
    const slots = await getAvailableSlots(booking.userId, booking.eventTypeId, dateStr, tz);

    // Also allow the original time slot (since it's occupied by *this* booking)
    const originalStart = booking.startTime.toISOString();
    const originalEnd = booking.endTime.toISOString();
    const isOriginalSlot = body.startTime === originalStart && body.endTime === originalEnd;

    const isValidSlot = isOriginalSlot || slots.some(
      (s) => s.start === body.startTime && s.end === body.endTime
    );

    if (!isValidSlot) {
      return NextResponse.json({ error: "Selected time slot is not available" }, { status: 409 });
    }

    const updated = await prisma.booking.update({
      where: { id: params.id },
      data: { startTime: newStart, endTime: newEnd, timezone: tz },
    });

    // Sync to external calendars
    const extIds = parseCalendarEventIds(booking.calendarEventId);
    if (extIds.google) {
      await updateGoogleCalendarEvent(booking.userId, extIds.google, {
        startTime: newStart,
        endTime: newEnd,
        timezone: tz,
        summary: `${booking.eventType.name} with ${booking.guestName}`,
        attendeeEmail: booking.guestEmail,
      });
    }
    if (extIds.apple) {
      await updateAppleCalendarEvent(booking.userId, extIds.apple, {
        summary: `${booking.eventType.name} with ${booking.guestName}`,
        description: booking.guestNotes || undefined,
        startTime: newStart,
        endTime: newEnd,
        attendeeEmail: booking.guestEmail,
        organizerEmail: booking.user.email,
        status: "CONFIRMED",
      });
    }

    // Send reschedule notification emails
    const zonedNewStart = toZonedTime(newStart, tz);
    const emailData = {
      hostName: booking.user.name,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      eventName: booking.eventType.name,
      startTime: format(zonedNewStart, "HH:mm"),
      endTime: format(toZonedTime(newEnd, tz), "HH:mm"),
      date: format(zonedNewStart, "EEEE, MMMM d, yyyy"),
      timezone: tz,
      cancelUrl: `${process.env.APP_URL || "http://localhost:3000"}/booking/cancel/${booking.cancelToken}`,
    };

    await Promise.allSettled([
      sendEmail(booking.user.email, "BOOKING_CONFIRMATION_HOST", booking.userId, emailData),
      sendEmail(booking.guestEmail, "BOOKING_CONFIRMATION_GUEST", booking.userId, emailData),
    ]);

    await triggerWebhooks(booking.userId, "booking.rescheduled", {
      bookingId: booking.id,
      eventType: booking.eventType.name,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      oldStartTime: booking.startTime.toISOString(),
      oldEndTime: booking.endTime.toISOString(),
      newStartTime: body.startTime,
      newEndTime: body.endTime,
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Invalid update. Provide status=CANCELLED or startTime+endTime to reschedule." }, { status: 400 });
}
