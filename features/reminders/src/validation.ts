import {
  reminderChannels,
  reminderLimits,
  type AgendaAppointment,
  type Reminder,
  type ReminderDetails,
  type ReminderError,
  type ReminderResult,
  type ScheduleReminderInput,
} from "./contracts.ts";

const explicitOffsetPattern = /(?:Z|[+-]\d{2}:\d{2})$/;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;

function failure<T>(
  code: ReminderError["code"],
  message: string,
  field?: string,
): ReminderResult<T> {
  return field === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, field } };
}

function boundedText(
  value: unknown,
  maximum: number,
  field: string,
  required: boolean,
): ReminderResult<string | undefined> {
  if (value === undefined && !required) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
    return failure("INVALID_INPUT", `${field} must be a string.`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maximum) {
    return failure(
      "INVALID_INPUT",
      `${field} must contain between 1 and ${maximum} characters.`,
      field,
    );
  }
  return { ok: true, value: trimmed };
}

export function validIdentifier(
  value: unknown,
  field: string,
): ReminderResult<string> {
  const result = boundedText(
    value,
    reminderLimits.identifierCharacters,
    field,
    true,
  );
  if (!result.ok) {
    return result;
  }
  if (result.value === undefined || !identifierPattern.test(result.value)) {
    return failure("INVALID_INPUT", `${field} is invalid.`, field);
  }
  return { ok: true, value: result.value };
}

export function parseTimestamp(
  value: unknown,
  field: string,
): ReminderResult<{ readonly iso: string; readonly epoch: number }> {
  if (typeof value !== "string" || !explicitOffsetPattern.test(value)) {
    return failure(
      "INVALID_REMINDER_TIME",
      `${field} must be an ISO timestamp with an explicit timezone.`,
      field,
    );
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    return failure(
      "INVALID_REMINDER_TIME",
      `${field} must be a valid ISO timestamp.`,
      field,
    );
  }
  return { ok: true, value: { iso: new Date(epoch).toISOString(), epoch } };
}

export function validateAppointment(
  value: AgendaAppointment,
  requestedId: string,
): ReminderResult<AgendaAppointment> {
  let id: unknown;
  let startAt: unknown;
  let title: unknown;
  let location: unknown;
  try {
    id = value.id;
    startAt = value.startAt;
    title = value.title;
    location = value.location;
  } catch {
    return failure("AGENDA_FAILURE", "Agenda returned invalid appointment data.");
  }
  const validId = validIdentifier(id, "appointment.id");
  const validStart = parseTimestamp(startAt, "appointment.startAt");
  const validTitle = boundedText(
    title,
    reminderLimits.appointmentTitleCharacters,
    "appointment.title",
    false,
  );
  const validLocation = boundedText(
    location,
    reminderLimits.appointmentLocationCharacters,
    "appointment.location",
    false,
  );
  if (
    !validId.ok ||
    validId.value !== requestedId ||
    !validStart.ok ||
    !validTitle.ok ||
    !validLocation.ok
  ) {
    return failure("AGENDA_FAILURE", "Agenda returned invalid appointment data.");
  }
  return {
    ok: true,
    value: {
      id: validId.value,
      startAt: validStart.value.iso,
      ...(validTitle.value === undefined ? {} : { title: validTitle.value }),
      ...(validLocation.value === undefined
        ? {}
        : { location: validLocation.value }),
    },
  };
}

export function validateScheduleInput(
  input: ScheduleReminderInput,
  appointment: AgendaAppointment,
  currentTime: number,
): ReminderResult<{
  readonly appointmentId: string;
  readonly remindAt: string;
  readonly channel: "sms" | "call";
  readonly details: ReminderDetails;
}> {
  let appointmentId: unknown;
  let remindAt: unknown;
  let channel: unknown;
  let details: unknown;
  try {
    appointmentId = input.appointmentId;
    remindAt = input.remindAt;
    channel = input.channel;
    details = input.details;
  } catch {
    return failure("INVALID_INPUT", "Reminder input is invalid.");
  }
  const validId = validIdentifier(appointmentId, "appointmentId");
  if (!validId.ok) {
    return validId;
  }
  const validTime = parseTimestamp(remindAt, "remindAt");
  if (!validTime.ok) {
    return validTime;
  }
  if (validTime.value.epoch <= currentTime) {
    return failure(
      "INVALID_REMINDER_TIME",
      "remindAt must be in the future.",
      "remindAt",
    );
  }
  const appointmentTime = Date.parse(appointment.startAt);
  if (validTime.value.epoch >= appointmentTime) {
    return failure(
      "INVALID_REMINDER_TIME",
      "remindAt must be before the appointment starts.",
      "remindAt",
    );
  }
  if (channel !== "sms" && channel !== "call") {
    return failure("INVALID_INPUT", "channel must be sms or call.", "channel");
  }
  if (typeof details !== "object" || details === null) {
    return failure("INVALID_INPUT", "details is invalid.", "details");
  }
  let type: unknown;
  try {
    type = Reflect.get(details, "type");
  } catch {
    return failure("INVALID_INPUT", "details is invalid.", "details");
  }
  if (type === "appointment") {
    return {
      ok: true,
      value: {
        appointmentId: validId.value,
        remindAt: validTime.value.iso,
        channel,
        details: { type: "appointment" },
      },
    };
  }
  if (type === "medication") {
    let instruction: unknown;
    try {
      instruction = Reflect.get(details, "instruction");
    } catch {
      return failure("INVALID_INPUT", "details is invalid.", "details");
    }
    const validInstruction = boundedText(
      instruction,
      reminderLimits.medicationInstructionCharacters,
      "details.instruction",
      true,
    );
    if (!validInstruction.ok || validInstruction.value === undefined) {
      return validInstruction.ok
        ? failure("INVALID_INPUT", "Medication instruction is required.")
        : validInstruction;
    }
    return {
      ok: true,
      value: {
        appointmentId: validId.value,
        remindAt: validTime.value.iso,
        channel,
        details: { type: "medication", instruction: validInstruction.value },
      },
    };
  }
  return failure(
    "INVALID_INPUT",
    "details.type must be appointment or medication.",
    "details.type",
  );
}

export function isValidReminder(value: Reminder): boolean {
  try {
    const id = validIdentifier(value.id, "id");
    const appointmentId = validIdentifier(value.appointmentId, "appointmentId");
    const remindAt = parseTimestamp(value.remindAt, "remindAt");
    const createdAt = parseTimestamp(value.createdAt, "createdAt");
    if (!id.ok || !appointmentId.ok || !remindAt.ok || !createdAt.ok) {
      return false;
    }
    if (!reminderChannels.some((channel) => channel === value.channel)) {
      return false;
    }
    if (value.details.type === "medication") {
      const instruction = boundedText(
        value.details.instruction,
        reminderLimits.medicationInstructionCharacters,
        "details.instruction",
        true,
      );
      if (!instruction.ok) {
        return false;
      }
    } else if (value.details.type !== "appointment") {
      return false;
    }
    if (value.status === "cancelled") {
      return (
        parseTimestamp(value.cancelledAt, "cancelledAt").ok &&
        (value.cancellationReason === "requested" ||
          value.cancellationReason === "appointment-missing")
      );
    }
    return value.status === "scheduled";
  } catch {
    return false;
  }
}
