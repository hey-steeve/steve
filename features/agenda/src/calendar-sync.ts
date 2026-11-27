import { agendaLimits, type CalendarGatewayResponse } from "./types.ts";

const zonedIsoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const daysInMonth = (year: number, month: number): number => {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ] ?? 0;
};

export const isValidZonedDateTime = (value: unknown): value is string => {
  if (
    typeof value !== "string" ||
    value.length > agendaLimits.dateTimeLength ||
    !zonedIsoDateTimePattern.test(value)
  ) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const zone = value.endsWith("Z") ? "Z" : value.slice(-6);
  const offsetHour = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const offsetMinute = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour !== 14 || offsetMinute === 0) &&
    Number.isFinite(Date.parse(value))
  );
};

export const isValidExternalEventId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= agendaLimits.calendarExternalEventIdLength;

export const validateCalendarGatewayResponse = (
  value: unknown,
): CalendarGatewayResponse | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const status: unknown = Reflect.get(value, "status");
  const keys = Object.keys(value).sort();
  if (status === "rejected") {
    return keys.length === 1 && keys[0] === "status"
      ? { status: "rejected" }
      : undefined;
  }
  const externalEventId: unknown = Reflect.get(value, "externalEventId");
  const syncedAt: unknown = Reflect.get(value, "syncedAt");
  if (
    status !== "synced" ||
    keys.join(",") !== "externalEventId,status,syncedAt" ||
    !isValidExternalEventId(externalEventId) ||
    !isValidZonedDateTime(syncedAt)
  ) {
    return undefined;
  }
  return { status: "synced", externalEventId, syncedAt };
};
