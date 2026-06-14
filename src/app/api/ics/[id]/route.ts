import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ical, { ICalCalendarMethod } from "ical-generator";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: params.id },
    include: { eventType: true, user: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const calendar = ical({ name: "Timely Booking", method: ICalCalendarMethod.REQUEST });

  calendar.createEvent({
    start: booking.startTime,
    end: booking.endTime,
    summary: `${booking.eventType.name} with ${booking.user.name}`,
    description: booking.guestNotes || undefined,
    organizer: { name: booking.user.name, email: booking.user.email },
    attendees: [{ email: booking.guestEmail, name: booking.guestName }],
  });

  const icsContent = calendar.toString();

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${booking.id}.ics"`,
    },
  });
}
