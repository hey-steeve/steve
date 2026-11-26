import {
  reminderLimits,
  type AgendaAppointment,
  type CancelledReminder,
  type CancelReminderOutcome,
  type Reminder,
  type ReminderDependencies,
  type ReminderError,
  type ReminderResult,
  type ReminderService,
  type ScheduleReminderInput,
  type ScheduledReminder,
} from "./contracts.ts";
import { copyReminder } from "./reminder-copy.ts";
import {
  isValidReminder,
  validateAppointment,
  validateScheduleInput,
  validIdentifier,
} from "./validation.ts";

function failure<T>(
  code: ReminderError["code"],
  message: string,
  field?: string,
): ReminderResult<T> {
  return field === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, field } };
}

function currentTimestamp(now: () => Date): ReminderResult<{
  readonly iso: string;
  readonly epoch: number;
}> {
  try {
    const value = now();
    const epoch = value.valueOf();
    return Number.isFinite(epoch)
      ? { ok: true, value: { iso: value.toISOString(), epoch } }
      : failure("CLOCK_FAILURE", "Reminder clock failed.");
  } catch {
    return failure("CLOCK_FAILURE", "Reminder clock failed.");
  }
}

async function appointmentFromAgenda(
  appointmentId: string,
  agendaSource: ReminderDependencies["agendaSource"],
): Promise<ReminderResult<AgendaAppointment>> {
  let appointment: AgendaAppointment | null;
  try {
    appointment = await agendaSource.getAppointment(appointmentId);
  } catch {
    return failure("AGENDA_FAILURE", "Agenda lookup failed.");
  }
  if (appointment === null) {
    return failure(
      "APPOINTMENT_NOT_FOUND",
      "Appointment was not found in Agenda.",
    );
  }
  return validateAppointment(appointment, appointmentId);
}

function sortReminders(reminders: readonly Reminder[]): Reminder[] {
  return [...reminders].sort(
    (left, right) =>
      left.remindAt.localeCompare(right.remindAt) ||
      left.id.localeCompare(right.id),
  );
}

export function createReminderService(
  dependencies: ReminderDependencies,
): ReminderService {
  const { agendaSource, storage, now } = dependencies;
  const generateId =
    dependencies.generateId ??
    (() => `rem_${globalThis.crypto.randomUUID().replaceAll("-", "")}`);

  return {
    async schedule(
      input: ScheduleReminderInput,
    ): Promise<ReminderResult<ScheduledReminder>> {
      const timestamp = currentTimestamp(now);
      if (!timestamp.ok) {
        return timestamp;
      }
      let appointmentId: unknown;
      try {
        appointmentId = input.appointmentId;
      } catch {
        return failure("INVALID_INPUT", "Reminder input is invalid.");
      }
      const validAppointmentId = validIdentifier(
        appointmentId,
        "appointmentId",
      );
      if (!validAppointmentId.ok) {
        return validAppointmentId;
      }
      const appointment = await appointmentFromAgenda(
        validAppointmentId.value,
        agendaSource,
      );
      if (!appointment.ok) {
        return appointment;
      }
      const validated = validateScheduleInput(
        input,
        appointment.value,
        timestamp.value.epoch,
      );
      if (!validated.ok) {
        return validated;
      }

      let generatedId: string;
      try {
        generatedId = generateId();
      } catch {
        return failure("DEPENDENCY_FAILURE", "Reminder identifier failed.");
      }
      const validGeneratedId = validIdentifier(generatedId, "id");
      if (!validGeneratedId.ok) {
        return failure("DEPENDENCY_FAILURE", "Reminder identifier failed.");
      }
      const reminder: ScheduledReminder = {
        id: validGeneratedId.value,
        appointmentId: validated.value.appointmentId,
        remindAt: validated.value.remindAt,
        channel: validated.value.channel,
        details: validated.value.details,
        createdAt: timestamp.value.iso,
        status: "scheduled",
      };

      let outcome: "created" | "duplicate" | "full";
      try {
        outcome = await storage.create(copyReminder(reminder));
      } catch {
        return failure("STORAGE_FAILURE", "Reminder storage failed.");
      }
      if (outcome === "duplicate") {
        return failure(
          "DUPLICATE_REMINDER",
          "An identical reminder already exists.",
        );
      }
      if (outcome === "full") {
        return failure("STORAGE_FULL", "Reminder storage is full.");
      }
      if (outcome !== "created") {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned an invalid result.",
        );
      }
      return { ok: true, value: copyReminder(reminder) };
    },

    async list(): Promise<ReminderResult<readonly Reminder[]>> {
      let reminders: readonly Reminder[];
      try {
        reminders = await storage.list();
      } catch {
        return failure("STORAGE_FAILURE", "Reminder storage failed.");
      }
      if (
        !Array.isArray(reminders) ||
        reminders.length > reminderLimits.storedReminders ||
        !reminders.every((reminder) => isValidReminder(reminder))
      ) {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned invalid data.",
        );
      }
      return {
        ok: true,
        value: sortReminders(reminders).map((reminder) =>
          copyReminder(reminder),
        ),
      };
    },

    async cancel(
      id: string,
    ): Promise<ReminderResult<CancelReminderOutcome>> {
      const validId = validIdentifier(id, "id");
      if (!validId.ok) {
        return validId;
      }
      let reminder: Reminder | null;
      try {
        reminder = await storage.get(validId.value);
      } catch {
        return failure("STORAGE_FAILURE", "Reminder storage failed.");
      }
      if (reminder === null) {
        return failure("REMINDER_NOT_FOUND", "Reminder was not found.");
      }
      if (!isValidReminder(reminder) || reminder.id !== validId.value) {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned invalid data.",
        );
      }
      if (reminder.status === "cancelled") {
        return {
          ok: true,
          value: {
            outcome: "already-cancelled",
            reminder: copyReminder(reminder),
          },
        };
      }
      const timestamp = currentTimestamp(now);
      if (!timestamp.ok) {
        return timestamp;
      }
      const cancelled: CancelledReminder = {
        ...reminder,
        details: { ...reminder.details },
        status: "cancelled",
        cancelledAt: timestamp.value.iso,
        cancellationReason: "requested",
      };
      let outcome: "updated" | "not-found" | "state-conflict";
      try {
        outcome = await storage.replace(
          reminder.id,
          "scheduled",
          copyReminder(cancelled),
        );
      } catch {
        return failure("STORAGE_FAILURE", "Reminder storage failed.");
      }
      if (outcome !== "updated") {
        return failure(
          "STORAGE_FAILURE",
          "Reminder state changed during cancellation.",
        );
      }
      return {
        ok: true,
        value: { outcome: "cancelled", reminder: copyReminder(cancelled) },
      };
    },
  };
}
