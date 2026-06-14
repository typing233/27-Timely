import { prisma } from "./prisma";
import { v4 as uuidv4 } from "uuid";

const APPLE_CALDAV_BASE = "https://caldav.icloud.com";

interface CalDAVCredentials {
  username: string;
  password: string;
  calendarUrl: string;
}

async function getCredentials(userId: string): Promise<CalDAVCredentials | null> {
  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId, provider: "APPLE" } },
  });

  if (!integration || !integration.isActive) return null;
  if (!integration.refreshToken || !integration.calendarId) return null;

  return {
    username: integration.refreshToken,
    password: integration.accessToken,
    calendarUrl: integration.calendarId,
  };
}

function authHeader(creds: { username: string; password: string }): string {
  return "Basic " + Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
}

async function caldavRequest(
  url: string,
  method: string,
  creds: { username: string; password: string },
  body?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {
    Authorization: authHeader(creds),
    ...extraHeaders,
  };

  if (body) {
    headers["Content-Type"] = "application/xml; charset=utf-8";
  }

  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  return { status: res.status, text };
}

// --- Discovery ---

function extractHref(xml: string, tagPattern: RegExp): string | null {
  const match = xml.match(tagPattern);
  if (!match) return null;
  const hrefMatch = match[0].match(/<[dD]:href[^>]*>([^<]+)<\/[dD]:href>/);
  return hrefMatch ? hrefMatch[1] : null;
}

async function discoverPrincipal(
  baseUrl: string,
  creds: { username: string; password: string }
): Promise<string | null> {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
  </d:prop>
</d:propfind>`;

  const res = await caldavRequest(baseUrl, "PROPFIND", creds, body, { Depth: "0" });
  if (res.status >= 400) return null;

  const href = extractHref(res.text, /<d:current-user-principal[\s\S]*?<\/d:current-user-principal>/i);
  if (!href) return null;

  // Resolve relative URL
  const url = new URL(baseUrl);
  return `${url.origin}${href}`;
}

async function discoverCalendarHome(
  principalUrl: string,
  creds: { username: string; password: string }
): Promise<string | null> {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set/>
  </d:prop>
</d:propfind>`;

  const res = await caldavRequest(principalUrl, "PROPFIND", creds, body, { Depth: "0" });
  if (res.status >= 400) return null;

  const href = extractHref(res.text, /<c:calendar-home-set[\s\S]*?<\/c:calendar-home-set>/i);
  if (!href) return null;

  const url = new URL(principalUrl);
  return `${url.origin}${href}`;
}

async function discoverFirstCalendar(
  homeUrl: string,
  creds: { username: string; password: string }
): Promise<string | null> {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`;

  const res = await caldavRequest(homeUrl, "PROPFIND", creds, body, { Depth: "1" });
  if (res.status >= 400) return null;

  // Parse multi-status responses to find calendar collections
  const responses = res.text.split(/<d:response>/i).slice(1);
  for (const response of responses) {
    const isCalendar = /<c:calendar\s*\/>/i.test(response) ||
      /<cal:calendar\s*\/>/i.test(response) ||
      /urn:ietf:params:xml:ns:caldav.*calendar/i.test(response);

    if (isCalendar) {
      const hrefMatch = response.match(/<d:href[^>]*>([^<]+)<\/d:href>/i);
      if (hrefMatch) {
        const url = new URL(homeUrl);
        return `${url.origin}${hrefMatch[1]}`;
      }
    }
  }

  return null;
}

export async function discoverCalendarUrl(
  baseUrl: string,
  creds: { username: string; password: string }
): Promise<string | null> {
  // Step 1: Find current-user-principal
  const principal = await discoverPrincipal(baseUrl, creds);
  if (!principal) return null;

  // Step 2: Find calendar-home-set
  const home = await discoverCalendarHome(principal, creds);
  if (!home) return null;

  // Step 3: Find first calendar collection
  const calendar = await discoverFirstCalendar(home, creds);
  return calendar;
}

// --- Connection Test ---

export async function testAppleConnection(params: {
  username: string;
  password: string;
  calendarUrl?: string;
}): Promise<{ success: boolean; calendarUrl?: string; error?: string }> {
  const creds = { username: params.username, password: params.password };

  // If user provides a direct calendar URL, verify it with a PROPFIND
  if (params.calendarUrl) {
    try {
      const res = await caldavRequest(params.calendarUrl, "PROPFIND", creds,
        `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`,
        { Depth: "0" }
      );
      if (res.status === 207 || res.status === 200) {
        return { success: true, calendarUrl: params.calendarUrl };
      }
      if (res.status === 401) {
        return { success: false, error: "Authentication failed. Check your app-specific password." };
      }
      return { success: false, error: `Server returned status ${res.status}` };
    } catch (e) {
      return { success: false, error: `Cannot reach server: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Auto-discover the calendar URL
  try {
    const discoveredUrl = await discoverCalendarUrl(APPLE_CALDAV_BASE, creds);
    if (discoveredUrl) {
      return { success: true, calendarUrl: discoveredUrl };
    }

    // Fallback: try common iCloud CalDAV paths
    const fallbackPaths = [
      `${APPLE_CALDAV_BASE}/${params.username}/calendars/home/`,
      `${APPLE_CALDAV_BASE}/${params.username}/calendars/personal/`,
      `${APPLE_CALDAV_BASE}/${params.username}/calendars/`,
    ];

    for (const path of fallbackPaths) {
      const res = await caldavRequest(path, "PROPFIND", creds,
        `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`,
        { Depth: "0" }
      );
      if (res.status === 207 || res.status === 200) {
        return { success: true, calendarUrl: path };
      }
    }

    return { success: false, error: "Could not discover calendar. Please provide the CalDAV calendar URL directly." };
  } catch (e) {
    return { success: false, error: `Discovery failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// --- ICS formatting ---

function toICSDateUTC(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeICSText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildICS(params: {
  uid: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  organizerEmail?: string;
  status?: string;
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Timely//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${toICSDateUTC(new Date())}`,
    `DTSTART:${toICSDateUTC(params.startTime)}`,
    `DTEND:${toICSDateUTC(params.endTime)}`,
    `SUMMARY:${escapeICSText(params.summary)}`,
  ];

  if (params.description) {
    lines.push(`DESCRIPTION:${escapeICSText(params.description)}`);
  }
  if (params.organizerEmail) {
    lines.push(`ORGANIZER;CN=Host:mailto:${params.organizerEmail}`);
  }
  if (params.attendeeEmail) {
    lines.push(`ATTENDEE;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:${params.attendeeEmail}`);
  }
  lines.push(`STATUS:${params.status || "CONFIRMED"}`);
  lines.push(`SEQUENCE:${Date.now()}`);
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

// --- Public API ---

export async function getAppleBusyTimes(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  const creds = await getCredentials(userId);
  if (!creds) return [];

  const report = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-data>
      <c:comp name="VCALENDAR">
        <c:comp name="VEVENT">
          <c:prop name="DTSTART"/>
          <c:prop name="DTEND"/>
          <c:prop name="DURATION"/>
          <c:prop name="SUMMARY"/>
          <c:prop name="TRANSP"/>
        </c:comp>
      </c:comp>
    </c:calendar-data>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toICSDateUTC(timeMin)}" end="${toICSDateUTC(timeMax)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  try {
    const res = await caldavRequest(creds.calendarUrl, "REPORT", creds, report, { Depth: "1" });

    if (res.status !== 207 && res.status !== 200) {
      console.error(`Apple CalDAV REPORT returned ${res.status}`);
      return [];
    }

    const events: { start: Date; end: Date }[] = [];

    // Extract all VEVENT blocks
    const veventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT/g;
    let match;
    while ((match = veventRegex.exec(res.text)) !== null) {
      const vevent = match[0];

      // Skip transparent events (free time)
      if (/TRANSP:TRANSPARENT/i.test(vevent)) continue;

      const startMatch = vevent.match(/DTSTART[^:]*:(\S+)/);
      const endMatch = vevent.match(/DTEND[^:]*:(\S+)/);

      if (startMatch && endMatch) {
        const start = parseICSDateTime(startMatch[1]);
        const end = parseICSDateTime(endMatch[1]);
        if (start && end) {
          events.push({ start, end });
        }
      }
    }

    return events;
  } catch (error) {
    console.error("Apple CalDAV busy time query failed:", error);
    return [];
  }
}

function parseICSDateTime(str: string): Date | null {
  // Handle: 20240315T140000Z (UTC) or 20240315T140000 (local, treat as UTC)
  const cleaned = str.trim();
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) {
    // Handle date-only: 20240315
    const dm = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dm) return new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]));
    return null;
  }
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
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const uid = `${uuidv4()}@timely.app`;
  const icsData = buildICS({
    uid,
    summary: event.summary,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    attendeeEmail: event.attendeeEmail,
    organizerEmail: event.organizerEmail,
    status: "CONFIRMED",
  });

  // Ensure calendar URL ends with /
  const baseUrl = creds.calendarUrl.endsWith("/") ? creds.calendarUrl : `${creds.calendarUrl}/`;
  const eventUrl = `${baseUrl}${uid}.ics`;

  try {
    const res = await fetch(eventUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*",
      },
      body: icsData,
    });

    if (res.status >= 200 && res.status < 300) {
      return uid;
    }

    const responseText = await res.text();
    console.error(`Apple CalDAV PUT failed (${res.status}):`, responseText.slice(0, 500));
    return null;
  } catch (error) {
    console.error("Apple CalDAV create event failed:", error);
    return null;
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
): Promise<boolean> {
  const creds = await getCredentials(userId);
  if (!creds) return false;

  const icsData = buildICS({
    uid: eventUid,
    summary: event.summary,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    attendeeEmail: event.attendeeEmail,
    organizerEmail: event.organizerEmail,
    status: event.status || "CONFIRMED",
  });

  const baseUrl = creds.calendarUrl.endsWith("/") ? creds.calendarUrl : `${creds.calendarUrl}/`;
  const eventUrl = `${baseUrl}${eventUid}.ics`;

  try {
    const res = await fetch(eventUrl, {
      method: "PUT",
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "text/calendar; charset=utf-8",
      },
      body: icsData,
    });

    if (res.status >= 200 && res.status < 300) {
      return true;
    }

    const responseText = await res.text();
    console.error(`Apple CalDAV update failed (${res.status}):`, responseText.slice(0, 500));
    return false;
  } catch (error) {
    console.error("Apple CalDAV update event failed:", error);
    return false;
  }
}

export async function deleteAppleCalendarEvent(
  userId: string,
  eventUid: string
): Promise<boolean> {
  const creds = await getCredentials(userId);
  if (!creds) return false;

  const baseUrl = creds.calendarUrl.endsWith("/") ? creds.calendarUrl : `${creds.calendarUrl}/`;
  const eventUrl = `${baseUrl}${eventUid}.ics`;

  try {
    const res = await fetch(eventUrl, {
      method: "DELETE",
      headers: {
        Authorization: authHeader(creds),
      },
    });

    if (res.status >= 200 && res.status < 300 || res.status === 404) {
      return true;
    }

    console.error(`Apple CalDAV delete failed (${res.status})`);
    return false;
  } catch (error) {
    console.error("Apple CalDAV delete event failed:", error);
    return false;
  }
}
