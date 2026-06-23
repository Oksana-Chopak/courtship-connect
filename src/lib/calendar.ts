// Lightweight "Add to Google Calendar" links — no OAuth, no backend. Opens the
// Google Calendar event-template page prefilled with the game/event details.
function fmtUTC(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(o: {
  title: string;
  startISO: string;
  durationMin?: number;
  details?: string;
  location?: string;
}): string {
  const start = new Date(o.startISO);
  const end = new Date(start.getTime() + (o.durationMin ?? 90) * 60000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: o.title,
    dates: `${fmtUTC(start)}/${fmtUTC(end)}`,
  });
  if (o.details) p.set("details", o.details);
  if (o.location) p.set("location", o.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
