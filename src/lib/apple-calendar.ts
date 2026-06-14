import { prisma } from "./prisma";
import { v4 as uuidv4 } from "uuid";

const APPLE_CALDAV_BASE = process.env.APPLE_CALDAV_URL || "https://caldav.icloud.com";

interface CalDAVAuth {
  username: string;
  password: string;
}

async function getAppleCredentials(userId: string): Promise<CalDAVAuth | null> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId, provider: "APPLE" } },
  });

  if (!integration || !integration.isActive || !integration.calendarId) return null;

  return {
    username: integration.calendarId,
    password: integration.accessToken,
  };
}

function buildAuthHeader(auth: CalDAVAuth): string {
  return "Basic " + Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
}

async function findCalendarHome(auth: CalDAVAuth): Promise<string> {
  const propfind = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`;

  const res = await fetch(`${APPLE_CALDAV_BASE}/${auth.username}/`, {
    method: "PROPFIND",
    headers: {
      Authorization: buildAuthHeader(auth),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "0",
    },
    body: propfind,
  });

  const text = await res.text();
  const match = text.match(/<c(?:al)?:calendar-home-set[^>]*>\s*<d:href>([^<]+)<\/d:href>/i)
    || text.match(/<D:href>([^<]*calendars[^<]*)<\/D:href>/i);

  if (match) return match[1];
  return `${APPLE_CALDAV_BASE}/${auth.username}/calendars/`;
}

async function findDefaultCalendarPath(auth: CalDAVAuth): Promise<string> {
  const home = await findCalendarHome(auth);

  const propfind = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
  </d:prop>
</d:propfind>`;

  const res = await fetch(home, {
    method: "PROPFIND",
    headers: {
      Authorization: buildAuthHeader(auth),
      "Content-Type": "application/xml; charset=utf-8",
      Depth: "1",
    },
    body: propfind,
  });

  const text = await res.text();
  const calMatch = text.match(/<d:href>([^<]*)<\/d:href>[\s\S]*?<d:resourcetype>[\s\S]*?<c(?:al)?:calendar\s*\/>[\s\S]*?<\/d:resourcetype>/i);

  if (calMatch) return calMatch[1];
  return `${home}calendar/`;
}

function formatDateForICS(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildVEvent(params: {
  uid: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  organizerEmail?: string;
  status?: string;
}): string {
  let vevent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Timely//Scheduling//EN
BEGIN:VEVENT
UID:${params.uid}
DTSTAMP:${formatDateForICS(new Date())}
DTSTART:${formatDateForICS(params.startTime)}
DTEND:${formatDateForICS(params.endTime)}
SUMMARY:${params.summary}`;

  if (params.description) {
    vevent += `\nDESCRIPTION:${params.description.replace(/\n/g, "\\n")}`;
  }
  if (params.organizerEmail) {
    vevent += `\nORGANIZER:mailto:${params.organizerEmail}`;
  }
  if (params.attendeeEmail) {
    vevent += `\nATTENDEE;RSVP=TRUE:mailto:${params.attendeeEmail}`;
  }
  if (params.status) {
    vevent += `\nSTATUS:${params.status}`;
  }

  vevent += `\nEND:VEVENT
END:VCALENDAR`;

  return vevent;
}

export async function getAppleBusyTimes(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  const auth = await getAppleCredentials(userId);
  if (!auth) return [];

  const calendarPath = await findDefaultCalendarPath(auth);

  const report = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${formatDateForICS(timeMin)}" end="${formatDateForICS(timeMax)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  try {
    const res = await fetch(calendarPath, {
      method: "REPORT",
      headers: {
        Authorization: buildAuthHeader(auth),
        "Content-Type": "application/xml; charset=utf-8",
        Depth: "1",
      },
      body: report,
    });

    if (!res.ok) return [];

    const text = await res.text();
    const events: { start: Date; end: Date }[] = [];

    const regex = /DTSTART[^:]*:(\d{8}T\d{6}Z?)[\s\S]*?DTEND[^:]*:(\d{8}T\d{6}Z?)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = parseICSDate(match[1]);
      const end = parseICSDate(match[2]);
      if (start && end) {
        events.push({ start, end });
      }
    }

    return events;
  } catch (error) {
    console.error("Failed to fetch Apple Calendar busy times:", error);
    return [];
  }
}

function parseICSDate(str: string): Date | null {
  const m = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

export async function createAppleCalendarEvent(
  userId: string,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendeeEmail: string;
    organizerEmail?: string;
  }
): Promise<string | null> {
  const auth = await getAppleCredentials(userId);
  if (!auth) return null;

  const calendarPath = await findDefaultCalendarPath(auth);
  const uid = `${uuidv4()}@timely.app`;
  const eventPath = `${calendarPath}${uid}.ics`;

  const icsData = buildVEvent({
    uid,
    summary: event.summary,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    attendeeEmail: event.attendeeEmail,
    organizerEmail: event.organizerEmail,
    status: "CONFIRMED",
  });

  try {
    const res = await fetch(eventPath, {
      method: "PUT",
      headers: {
        Authorization: buildAuthHeader(auth),
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*",
      },
      body: icsData,
    });

    if (res.ok || res.status === 201) {
      return uid;
    }
    console.error("Apple CalDAV PUT failed:", res.status, await res.text());
    return null;
  } catch (error) {
    console.error("Failed to create Apple Calendar event:", error);
    return null;
  }
}

export async function deleteAppleCalendarEvent(
  userId: string,
  eventUid: string
): Promise<void> {
  const auth = await getAppleCredentials(userId);
  if (!auth) return;

  const calendarPath = await findDefaultCalendarPath(auth);
  const eventPath = `${calendarPath}${eventUid}.ics`;

  try {
    await fetch(eventPath, {
      method: "DELETE",
      headers: {
        Authorization: buildAuthHeader(auth),
      },
    });
  } catch (error) {
    console.error("Failed to delete Apple Calendar event:", error);
  }
}

export async function updateAppleCalendarEvent(
  userId: string,
  eventUid: string,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendeeEmail: string;
    organizerEmail?: string;
    status?: string;
  }
): Promise<void> {
  const auth = await getAppleCredentials(userId);
  if (!auth) return;

  const calendarPath = await findDefaultCalendarPath(auth);
  const eventPath = `${calendarPath}${eventUid}.ics`;

  const icsData = buildVEvent({
    uid: eventUid,
    summary: event.summary,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    attendeeEmail: event.attendeeEmail,
    organizerEmail: event.organizerEmail,
    status: event.status || "CONFIRMED",
  });

  try {
    await fetch(eventPath, {
      method: "PUT",
      headers: {
        Authorization: buildAuthHeader(auth),
        "Content-Type": "text/calendar; charset=utf-8",
      },
      body: icsData,
    });
  } catch (error) {
    console.error("Failed to update Apple Calendar event:", error);
  }
}
