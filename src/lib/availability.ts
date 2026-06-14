import { prisma } from "./prisma";
import { addMinutes, startOfDay, endOfDay, eachDayOfInterval, format, isBefore, addDays, addHours, parseISO } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { getGoogleBusyTimes } from "./google-calendar";

interface TimeSlot {
  start: string;
  end: string;
}

export async function getAvailableSlots(
  userId: string,
  eventTypeId: string,
  dateStr: string,
  timezone: string
): Promise<TimeSlot[]> {
  const eventType = await prisma.eventType.findUnique({ where: { id: eventTypeId } });
  if (!eventType) return [];

  const settings = await prisma.availabilitySettings.findUnique({ where: { userId } });
  const minAdvanceHours = settings?.minAdvanceHours ?? 24;
  const maxAdvanceDays = settings?.maxAdvanceDays ?? 60;
  const bufferMinutes = settings?.bufferMinutes ?? 0;

  const date = parseISO(dateStr);
  const now = new Date();

  const minBookingTime = addHours(now, minAdvanceHours);
  const maxBookingTime = addDays(now, maxAdvanceDays);

  if (isBefore(endOfDay(date), minBookingTime) || isBefore(maxBookingTime, startOfDay(date))) {
    return [];
  }

  const dayOfWeek = toZonedTime(date, timezone).getDay();

  const rules = await prisma.availabilityRule.findMany({
    where: { userId, dayOfWeek, isActive: true },
  });

  if (rules.length === 0) return [];

  const existingBookings = await prisma.booking.findMany({
    where: {
      userId,
      status: "CONFIRMED",
      startTime: { gte: startOfDay(date) },
      endTime: { lte: endOfDay(date) },
    },
  });

  let busyTimes: { start: Date; end: Date }[] = existingBookings.map((b) => ({
    start: new Date(b.startTime),
    end: new Date(b.endTime),
  }));

  try {
    const googleBusy = await getGoogleBusyTimes(userId, startOfDay(date), endOfDay(date));
    busyTimes = [...busyTimes, ...googleBusy];
  } catch {}

  const slots: TimeSlot[] = [];

  for (const rule of rules) {
    const [startH, startM] = rule.startTime.split(":").map(Number);
    const [endH, endM] = rule.endTime.split(":").map(Number);

    const ruleStart = fromZonedTime(
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), startH, startM),
      timezone
    );
    const ruleEnd = fromZonedTime(
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), endH, endM),
      timezone
    );

    let current = ruleStart;

    while (addMinutes(current, eventType.duration) <= ruleEnd) {
      const slotEnd = addMinutes(current, eventType.duration);

      if (isBefore(current, minBookingTime)) {
        current = addMinutes(current, 15);
        continue;
      }

      const bufferedStart = addMinutes(current, -bufferMinutes);
      const bufferedEnd = addMinutes(slotEnd, bufferMinutes);

      const hasConflict = busyTimes.some(
        (busy) => bufferedStart < busy.end && bufferedEnd > busy.start
      );

      if (!hasConflict) {
        slots.push({
          start: current.toISOString(),
          end: slotEnd.toISOString(),
        });
      }

      current = addMinutes(current, 15);
    }
  }

  return slots;
}

export async function getAvailableDates(
  userId: string,
  eventTypeId: string,
  month: string,
  timezone: string
): Promise<string[]> {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 0);

  const days = eachDayOfInterval({ start, end });
  const availableDates: string[] = [];

  for (const day of days) {
    const dateStr = format(day, "yyyy-MM-dd");
    const slots = await getAvailableSlots(userId, eventTypeId, dateStr, timezone);
    if (slots.length > 0) {
      availableDates.push(dateStr);
    }
  }

  return availableDates;
}
