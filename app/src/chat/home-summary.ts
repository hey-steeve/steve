// Synthetic home data. It mirrors the demo seeds of the agenda, reminders,
// vault and inbox pages so the home cards and those pages tell one story.

export const homeDemoNow = new Date("2026-11-27T10:00:00Z");

export const homeNextAppointment = {
  practitioner: "Dr Camille Lunéval",
  specialty: "General practice",
  startsAt: "2026-12-02T10:00:00+01:00",
} as const;

export const homeUpcoming = [
  {
    kind: "reminder",
    href: "/reminders",
    title: "Appointment reminder",
    detail: "By text",
    when: "1 Dec",
  },
  {
    kind: "message",
    href: "/inbox",
    title: "Document from the practice",
    detail: "Lunéval practice",
    when: "Read",
  },
] as const;

export const homeSpace = [
  { count: 1, one: "document", many: "documents", href: "/vault", tone: "primary" },
  { count: 1, one: "rappel", many: "rappels", href: "/reminders", tone: "orange" },
  { count: 2, one: "message", many: "messages", href: "/inbox", tone: "teal" },
] as const;

const timeZone = "Europe/Paris";
const dayMs = 24 * 60 * 60 * 1000;

function parisDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return Date.parse(`${parts}T00:00:00Z`);
}

export function daysUntil(now: Date, startsAt: string): number {
  return Math.round((parisDay(new Date(startsAt)) - parisDay(now)) / dayMs);
}

export function countdownLabel(days: number): string {
  if (days <= 0) {
    return "Today";
  }
  if (days === 1) {
    return "Tomorrow";
  }
  return `In ${days} days`;
}

export function appointmentDay(startsAt: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(new Date(startsAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const weekday = part("weekday");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${part("day")} ${part("month")}`;
}

export function appointmentTime(startsAt: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export const homeNotifications = [
  {
    id: "agenda-confirmed",
    app: "Calendar",
    tone: "indigo",
    href: "/agenda",
    when: "2 h ago",
    title: "Appointment confirmed",
    body: "Dr Camille Lunéval confirmed Wednesday 2 Dec at 10:00.",
  },
  {
    id: "inbox-document",
    app: "Inbox",
    tone: "teal",
    href: "/inbox",
    when: "Yesterday",
    title: "Document from the practice",
    body: "The Lunéval practice sent you an appointment letter.",
  },
  {
    id: "reminder-scheduled",
    app: "Reminders",
    tone: "orange",
    href: "/reminders",
    when: "Yesterday",
    title: "Reminder scheduled",
    body: "You’ll get a text on 1 Dec at 6 pm.",
  },
] as const;

export const homeAccountLinks = [
  { href: "/profile", label: "My profile", detail: "Identity, history, preferences" },
  { href: "/vault", label: "Vault", detail: "Your documents, protected by Face ID" },
  { href: "/reminders", label: "My reminders", detail: "Texts and calls" },
  { href: "/inbox", label: "Inbox", detail: "Your Stevie address" },
] as const;
