import "server-only";

export type IcsStatus = "CONFIRMED" | "TENTATIVE" | "CANCELLED";

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  status: IcsStatus;
  stamp?: Date;
};

const ICS_DOMAIN = "burhanisportsclub.com";

export function toUtcDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function clubEventUid(eventId: string) {
  return `${eventId}@${ICS_DOMAIN}`;
}

export function personalEventUid(eventId: string, userId: string) {
  return `${eventId}-${userId}@${ICS_DOMAIN}`;
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(line: string) {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const max = first ? 75 : 74;
    const chunk = rest.slice(0, max);
    parts.push(first ? chunk : ` ${chunk}`);
    rest = rest.slice(chunk.length);
    first = false;
  }
  return parts.join("\r\n");
}

function formatUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsLines(event: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatUtc(event.stamp ?? new Date())}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `STATUS:${event.status}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcsCalendar(opts: { name: string; events: IcsEvent[] }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Burhani Sports Club//Events//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name)}`,
    "X-WR-TIMEZONE:America/Chicago",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const event of opts.events) {
    lines.push(...icsLines(event));
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsResponse(body: string, filename: string, cache: "public" | "private") {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": `${cache}, max-age=300`,
    },
  });
}
