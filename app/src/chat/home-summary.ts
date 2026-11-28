// Synthetic home data. It mirrors the demo seeds of the agenda, reminders,
// vault and inbox pages so the home cards and those pages tell one story.

export const homeDemoNow = new Date("2026-11-27T10:00:00Z");

export const homeNextAppointment = {
  practitioner: "Dr Camille Lunéval",
  specialty: "Médecine générale",
  startsAt: "2026-12-02T10:00:00+01:00",
} as const;

export const homeUpcoming = [
  {
    kind: "reminder",
    href: "/reminders",
    title: "Rappel de rendez-vous",
    detail: "Par SMS",
    when: "1er déc.",
  },
  {
    kind: "message",
    href: "/inbox",
    title: "Document du cabinet",
    detail: "Cabinet Lunéval",
    when: "Lire",
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
    return "Aujourd’hui";
  }
  if (days === 1) {
    return "Demain";
  }
  return `Dans ${days} jours`;
}

export function appointmentDay(startsAt: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
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
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export const homeNotifications = [
  {
    id: "agenda-confirmed",
    app: "Agenda",
    tone: "indigo",
    href: "/agenda",
    when: "Il y a 2 h",
    title: "Rendez-vous confirmé",
    body: "Dr Camille Lunéval a confirmé mercredi 2 déc. à 10:00.",
  },
  {
    id: "inbox-document",
    app: "Messagerie",
    tone: "teal",
    href: "/inbox",
    when: "Hier",
    title: "Document du cabinet",
    body: "Le cabinet Lunéval t’a envoyé une lettre de rendez-vous.",
  },
  {
    id: "reminder-scheduled",
    app: "Rappels",
    tone: "orange",
    href: "/reminders",
    when: "Hier",
    title: "Rappel programmé",
    body: "Tu recevras un SMS le 1er déc. à 18 h.",
  },
] as const;

export const homeAccountLinks = [
  { href: "/profile", label: "Mon profil", detail: "Identité, antécédents, préférences" },
  { href: "/vault", label: "Vault", detail: "Tes documents, protégés par Face ID" },
  { href: "/reminders", label: "Mes rappels", detail: "SMS et appels" },
  { href: "/inbox", label: "Messagerie", detail: "Ton adresse Stevie" },
] as const;
