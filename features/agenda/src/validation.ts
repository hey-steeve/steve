import {
  agendaLimits,
  type AgendaError,
  type AgendaResult,
  type AppointmentInput,
  type ConfirmedAppointment,
  type ValidationField,
} from "./types.ts";

const appointmentIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const zonedIsoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
};

const success = <Value>(value: Value): AgendaResult<Value> => ({
  status: "success",
  value,
});

const validationError = (
  field: ValidationField,
  reason: "required" | "invalid-format" | "too-long" | "invalid-range",
): AgendaResult<never> => ({
  status: "error",
  error: { kind: "validation", field, reason },
});

const validateBoundedText = (
  value: string | undefined,
  field: ValidationField,
  maximumLength: number,
): AgendaResult<string> => {
  if (value === undefined || value.trim().length === 0) {
    return validationError(field, "required");
  }

  if (value.length > maximumLength) {
    return validationError(field, "too-long");
  }

  return success(value);
};

export const validateAppointmentId = (id: string): AgendaResult<string> => {
  const bounded = validateBoundedText(
    id,
    "id",
    agendaLimits.appointmentIdLength,
  );
  if (bounded.status === "error") {
    return bounded;
  }

  if (!appointmentIdPattern.test(id)) {
    return validationError("id", "invalid-format");
  }

  return success(id);
};

const validateDateTime = (
  value: string,
  field: "startsAt" | "endsAt",
): AgendaResult<number> => {
  if (value.length > agendaLimits.dateTimeLength) {
    return validationError(field, "too-long");
  }

  if (!zonedIsoDateTimePattern.test(value)) {
    return validationError(field, "invalid-format");
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

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return validationError(field, "invalid-format");
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return validationError(field, "invalid-format");
  }

  return success(timestamp);
};

export const validateAppointment = (
  input: AppointmentInput,
): AgendaResult<ConfirmedAppointment> => {
  if (input.confirmation.status !== "confirmed") {
    return {
      status: "error",
      error: { kind: "not-confirmed", status: input.confirmation.status },
    };
  }

  const id = validateAppointmentId(input.id);
  if (id.status === "error") {
    return id;
  }

  const reference = validateBoundedText(
    input.confirmation.reference,
    "confirmation.reference",
    agendaLimits.confirmationReferenceLength,
  );
  if (reference.status === "error") {
    return reference;
  }

  const practitionerName = validateBoundedText(
    input.practitioner.name,
    "practitioner.name",
    agendaLimits.practitionerNameLength,
  );
  if (practitionerName.status === "error") {
    return practitionerName;
  }

  const startsAt = validateDateTime(input.startsAt, "startsAt");
  if (startsAt.status === "error") {
    return startsAt;
  }

  const endsAt = validateDateTime(input.endsAt, "endsAt");
  if (endsAt.status === "error") {
    return endsAt;
  }

  if (endsAt.value <= startsAt.value) {
    return validationError("endsAt", "invalid-range");
  }

  if (input.location.kind === "physical") {
    const address = validateBoundedText(
      input.location.address,
      "location.address",
      agendaLimits.locationLength,
    );
    if (address.status === "error") {
      return address;
    }

    return success({
      id: id.value,
      confirmation: { status: "confirmed", reference: reference.value },
      practitioner: { name: practitionerName.value },
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: { kind: "physical", address: address.value },
    });
  }

  if (input.location.label !== undefined) {
    const label = validateBoundedText(
      input.location.label,
      "location.label",
      agendaLimits.locationLength,
    );
    if (label.status === "error") {
      return label;
    }

    return success({
      id: id.value,
      confirmation: { status: "confirmed", reference: reference.value },
      practitioner: { name: practitionerName.value },
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: { kind: "remote", label: label.value },
    });
  }

  return success({
    id: id.value,
    confirmation: { status: "confirmed", reference: reference.value },
    practitioner: { name: practitionerName.value },
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: { kind: "remote" },
  });
};

export const storageError = (): AgendaResult<never> => ({
  status: "error",
  error: { kind: "storage-error" },
});

export const errorResult = (error: AgendaError): AgendaResult<never> => ({
  status: "error",
  error,
});
