import {
  reminderChannels,
  reminderLimits,
  type AgendaAppointment,
  type AppointmentReminderPlanRule,
  type PlanAppointmentRemindersInput,
  type Reminder,
  type ReminderDetails,
  type ReminderError,
  type ReminderMessage,
  type ReminderResult,
  type ScheduleReminderInput,
} from "./contracts.ts";

export type ScheduleInputSnapshot = {
  readonly appointmentId: unknown;
  readonly remindAt: unknown;
  readonly channel: unknown;
  readonly details: {
    readonly type: unknown;
    readonly instruction: unknown;
  };
};

export function validateAppointmentPlanInput(
  input: PlanAppointmentRemindersInput,
): ReminderResult<PlanAppointmentRemindersInput> {
  try {
    if (!hasExactProperties(input, ["appointmentId", "rules"])) {
      return failure("INVALID_INPUT", "Appointment plan input is invalid.");
    }
    const appointmentId: unknown = input.appointmentId;
    const rules: unknown = input.rules;
    const validAppointmentId = validIdentifier(appointmentId, "appointmentId");
    if (
      !validAppointmentId.ok ||
      validAppointmentId.value !== appointmentId
    ) {
      return validAppointmentId.ok
        ? failure("INVALID_INPUT", "appointmentId is invalid.", "appointmentId")
        : validAppointmentId;
    }
    if (
      !Array.isArray(rules) ||
      rules.length < 1 ||
      rules.length > reminderLimits.appointmentPlanRules
    ) {
      return failure(
        "INVALID_INPUT",
        `rules must contain between 1 and ${reminderLimits.appointmentPlanRules} entries.`,
        "rules",
      );
    }

    const validatedRules: AppointmentReminderPlanRule[] = [];
    const deduplicationKeys = new Set<string>();
    for (const [index, rule] of rules.entries()) {
      const field = `rules[${index}]`;
      if (!hasExactProperties(rule, ["minutesBefore", "channel"])) {
        return failure("INVALID_INPUT", `${field} is invalid.`, field);
      }
      const minutesBefore: unknown = Reflect.get(rule, "minutesBefore");
      const channel: unknown = Reflect.get(rule, "channel");
      if (
        typeof minutesBefore !== "number" ||
        !Number.isInteger(minutesBefore) ||
        minutesBefore < 1 ||
        minutesBefore > reminderLimits.appointmentPlanMinutesBefore
      ) {
        return failure(
          "INVALID_INPUT",
          `${field}.minutesBefore must be an integer between 1 and ${reminderLimits.appointmentPlanMinutesBefore}.`,
          `${field}.minutesBefore`,
        );
      }
      if (channel !== "sms" && channel !== "call") {
        return failure(
          "INVALID_INPUT",
          `${field}.channel must be sms or call.`,
          `${field}.channel`,
        );
      }
      const key = `${channel}:${minutesBefore}`;
      if (deduplicationKeys.has(key)) {
        return failure(
          "INVALID_INPUT",
          "Duplicate appointment reminder rules are not allowed.",
          "rules",
        );
      }
      deduplicationKeys.add(key);
      validatedRules.push({ minutesBefore, channel });
    }
    return {
      ok: true,
      value: {
        appointmentId: validAppointmentId.value,
        rules: validatedRules,
      },
    };
  } catch {
    return failure("INVALID_INPUT", "Appointment plan input is invalid.");
  }
}

function hasExactProperties(
  value: unknown,
  expected: readonly string[],
): value is object {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string" && expected.includes(key))
  );
}

const isoTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
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
  if (typeof value !== "string") {
    return failure(
      "INVALID_REMINDER_TIME",
      `${field} must be an ISO timestamp with an explicit timezone.`,
      field,
    );
  }
  const parts = isoTimestampPattern.exec(value);
  if (parts === null) {
    return failure(
      "INVALID_REMINDER_TIME",
      `${field} must be an ISO timestamp with an explicit timezone.`,
      field,
    );
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const offsetHour = parts[8] === undefined ? 0 : Number(parts[8]);
  const offsetMinute = parts[9] === undefined ? 0 : Number(parts[9]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const maximumDay = daysPerMonth[month - 1];
  if (
    maximumDay === undefined ||
    day < 1 ||
    day > maximumDay ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return failure(
      "INVALID_REMINDER_TIME",
      `${field} must be a valid ISO timestamp.`,
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
  input: ScheduleInputSnapshot,
  appointment: AgendaAppointment,
  currentTime: number,
): ReminderResult<{
  readonly appointmentId: string;
  readonly remindAt: string;
  readonly channel: "sms" | "call";
  readonly details: ReminderDetails;
}> {
  const { appointmentId, remindAt, channel, details } = input;
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
  const { type, instruction } = details;
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

export function snapshotScheduleInput(
  input: ScheduleReminderInput,
): ReminderResult<ScheduleInputSnapshot> {
  try {
    const appointmentId: unknown = input.appointmentId;
    const remindAt: unknown = input.remindAt;
    const channel: unknown = input.channel;
    const rawDetails: unknown = input.details;
    if (typeof rawDetails !== "object" || rawDetails === null) {
      return failure("INVALID_INPUT", "details is invalid.", "details");
    }
    const type: unknown = Reflect.get(rawDetails, "type");
    const instruction: unknown = type === "medication"
      ? Reflect.get(rawDetails, "instruction")
      : undefined;
    return {
      ok: true,
      value: {
        appointmentId,
        remindAt,
        channel,
        details: { type, instruction },
      },
    };
  } catch {
    return failure("INVALID_INPUT", "Reminder input is invalid.");
  }
}

export function validateReminderMessage(
  message: ReminderMessage,
): ReminderResult<ReminderMessage> {
  try {
    const reminderId: unknown = message.reminderId;
    const appointmentId: unknown = message.appointmentId;
    const channel: unknown = message.channel;
    const body: unknown = message.body;
    const validReminderId = validIdentifier(reminderId, "reminderId");
    const validAppointmentId = validIdentifier(appointmentId, "appointmentId");
    const validBody = boundedText(
      body,
      reminderLimits.messageBodyCharacters,
      "body",
      true,
    );
    if (
      !validReminderId.ok ||
      validReminderId.value !== reminderId ||
      !validAppointmentId.ok ||
      validAppointmentId.value !== appointmentId ||
      (channel !== "sms" && channel !== "call") ||
      !validBody.ok ||
      validBody.value === undefined ||
      validBody.value !== body
    ) {
      return failure("INVALID_INPUT", "Reminder message is invalid.");
    }
    return {
      ok: true,
      value: {
        reminderId: validReminderId.value,
        appointmentId: validAppointmentId.value,
        channel,
        body: validBody.value,
      },
    };
  } catch {
    return failure("INVALID_INPUT", "Reminder message is invalid.");
  }
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
    if (
      !Number.isSafeInteger(value.attemptCount) ||
      value.attemptCount < 0
    ) {
      return false;
    }
    if (value.status === "cancelled") {
      return (
        parseTimestamp(value.cancelledAt, "cancelledAt").ok &&
        (value.cancellationReason === "requested" ||
          value.cancellationReason === "appointment-missing")
      );
    }
    if (value.status === "dispatching") {
      return parseTimestamp(value.lastAttemptAt, "lastAttemptAt").ok;
    }
    if (value.status === "sent") {
      return parseTimestamp(value.sentAt, "sentAt").ok;
    }
    if (value.status === "failed") {
      return (
        parseTimestamp(value.failedAt, "failedAt").ok &&
        value.failureReason === "delivery-failed"
      );
    }
    return value.status === "scheduled";
  } catch {
    return false;
  }
}
