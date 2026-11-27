import type { AgendaClock, ConfirmedAppointment } from "./types.ts";

const toIcsDateTime = (date: Date): string =>
  date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");

const escapeText = (value: string): string =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

export const generateAppointmentIcs = (
  appointment: ConfirmedAppointment,
  clock: AgendaClock,
): string => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Steve//Agenda//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@agenda.steve.local`,
    `DTSTAMP:${toIcsDateTime(clock.now())}`,
    `DTSTART:${toIcsDateTime(new Date(appointment.startsAt))}`,
    `DTEND:${toIcsDateTime(new Date(appointment.endsAt))}`,
    `SUMMARY:${escapeText(`Appointment with ${appointment.practitioner.name}`)}`,
  ];

  if (appointment.location.kind === "physical") {
    lines.push(`LOCATION:${escapeText(appointment.location.address)}`);
  } else if (appointment.location.label !== undefined) {
    lines.push(`LOCATION:${escapeText(appointment.location.label)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
};
