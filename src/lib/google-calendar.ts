import { google } from "googleapis";
import { prisma } from "./prisma";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function getGoogleAuthUrl(state: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state,
    prompt: "consent",
  });
}

export async function exchangeGoogleCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function getGoogleBusyTimes(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
  });

  if (!integration || !integration.isActive) return [];

  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: integration.calendarId || "primary" }],
      },
    });

    const busySlots = response.data.calendars?.[integration.calendarId || "primary"]?.busy || [];
    return busySlots.map((slot) => ({
      start: new Date(slot.start!),
      end: new Date(slot.end!),
    }));
  } catch (error) {
    console.error("Failed to fetch Google Calendar busy times:", error);
    return [];
  }
}

export async function createGoogleCalendarEvent(
  userId: string,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendeeEmail: string;
    timezone: string;
  }
): Promise<string | null> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
  });

  if (!integration || !integration.isActive) return null;

  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const response = await calendar.events.insert({
      calendarId: integration.calendarId || "primary",
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startTime.toISOString(), timeZone: event.timezone },
        end: { dateTime: event.endTime.toISOString(), timeZone: event.timezone },
        attendees: [{ email: event.attendeeEmail }],
      },
    });
    return response.data.id || null;
  } catch (error) {
    console.error("Failed to create Google Calendar event:", error);
    return null;
  }
}

export async function deleteGoogleCalendarEvent(
  userId: string,
  eventId: string
): Promise<void> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
  });

  if (!integration || !integration.isActive) return;

  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    await calendar.events.delete({
      calendarId: integration.calendarId || "primary",
      eventId,
    });
  } catch (error) {
    console.error("Failed to delete Google Calendar event:", error);
  }
}

export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    startTime?: Date;
    endTime?: Date;
    attendeeEmail?: string;
    timezone?: string;
    status?: "confirmed" | "cancelled";
  }
): Promise<void> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
  });

  if (!integration || !integration.isActive) return;

  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const requestBody: Record<string, unknown> = {};
  if (event.summary) requestBody.summary = event.summary;
  if (event.description !== undefined) requestBody.description = event.description;
  if (event.startTime && event.timezone) {
    requestBody.start = { dateTime: event.startTime.toISOString(), timeZone: event.timezone };
  }
  if (event.endTime && event.timezone) {
    requestBody.end = { dateTime: event.endTime.toISOString(), timeZone: event.timezone };
  }
  if (event.attendeeEmail) {
    requestBody.attendees = [{ email: event.attendeeEmail }];
  }
  if (event.status) requestBody.status = event.status;

  try {
    await calendar.events.patch({
      calendarId: integration.calendarId || "primary",
      eventId,
      requestBody,
    });
  } catch (error) {
    console.error("Failed to update Google Calendar event:", error);
  }
}
