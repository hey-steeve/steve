import {
  reminderLimits,
  type AgendaAppointment,
  type AppointmentReminderPlan,
  type CancelledReminder,
  type CancelReminderOutcome,
  type DispatchOutcome,
  type DispatchReport,
  type DispatchingReminder,
  type FailedReminder,
  type PlanAppointmentRemindersInput,
  type PlannedAppointmentReminder,
  type Reminder,
  type ReminderDependencies,
  type ReminderError,
  type ReminderResult,
  type ReminderService,
  type ReminderSenderResult,
  type ScheduleReminderInput,
  type ScheduledReminder,
  type SentReminder,
  type SkippedAppointmentReminderRule,
} from "./contracts.ts";
import { buildReminderMessage, copyMessage } from "./reminder-message.ts";
import { copyReminder } from "./reminder-copy.ts";
import {
  isValidReminder,
  snapshotScheduleInput,
  validateAppointmentPlanInput,
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

function sortPlannedReminders(
  reminders: PlannedAppointmentReminder[],
): PlannedAppointmentReminder[] {
  return reminders.sort((left, right) => {
    const timestampOrder = left.remindAt.localeCompare(right.remindAt);
    if (timestampOrder !== 0) {
      return timestampOrder;
    }
    return left.channel < right.channel
      ? -1
      : left.channel > right.channel
        ? 1
        : 0;
  });
}

function validatedStorageRecords(
  records: readonly Reminder[],
): Reminder[] | null {
  try {
    if (
      !Array.isArray(records) ||
      records.length > reminderLimits.storedReminders
    ) {
      return null;
    }
    const snapshots: Reminder[] = [];
    for (const record of records) {
      const snapshot = copyReminder(record);
      if (!isValidReminder(snapshot)) {
        return null;
      }
      snapshots.push(snapshot);
    }
    return snapshots;
  } catch {
    return null;
  }
}

export function createReminderService(
  dependencies: ReminderDependencies,
): ReminderService {
  const { agendaSource, sender, storage, now } = dependencies;
  const generateId =
    dependencies.generateId ??
    (() => `rem_${globalThis.crypto.randomUUID().replaceAll("-", "")}`);

  return {
    async planAppointmentReminders(
      input: PlanAppointmentRemindersInput,
    ): Promise<ReminderResult<AppointmentReminderPlan>> {
      const validated = validateAppointmentPlanInput(input);
      if (!validated.ok) {
        return validated;
      }
      const appointment = await appointmentFromAgenda(
        validated.value.appointmentId,
        agendaSource,
      );
      if (!appointment.ok) {
        return appointment;
      }
      const timestamp = currentTimestamp(now);
      if (!timestamp.ok) {
        return timestamp;
      }

      const appointmentEpoch = Date.parse(appointment.value.startAt);
      const planned: PlannedAppointmentReminder[] = [];
      const skipped: SkippedAppointmentReminderRule[] = [];
      for (const rule of validated.value.rules) {
        const remindAtEpoch =
          appointmentEpoch - rule.minutesBefore * 60_000;
        if (remindAtEpoch <= timestamp.value.epoch) {
          skipped.push({
            rule: {
              minutesBefore: rule.minutesBefore,
              channel: rule.channel,
            },
            reason: "not-in-future",
          });
          continue;
        }
        planned.push({
          appointmentId: validated.value.appointmentId,
          remindAt: new Date(remindAtEpoch).toISOString(),
          channel: rule.channel,
          details: { type: "appointment" },
        });
      }
      return {
        ok: true,
        value: {
          appointmentId: validated.value.appointmentId,
          appointmentStartAt: appointment.value.startAt,
          planned: sortPlannedReminders(planned),
          skipped,
        },
      };
    },

    async schedule(
      input: ScheduleReminderInput,
    ): Promise<ReminderResult<ScheduledReminder>> {
      const timestamp = currentTimestamp(now);
      if (!timestamp.ok) {
        return timestamp;
      }
      const snapshot = snapshotScheduleInput(input);
      if (!snapshot.ok) {
        return snapshot;
      }
      const validAppointmentId = validIdentifier(
        snapshot.value.appointmentId,
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
        snapshot.value,
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
        attemptCount: 0,
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
      const snapshots = validatedStorageRecords(reminders);
      if (snapshots === null) {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned invalid data.",
        );
      }
      return {
        ok: true,
        value: sortReminders(snapshots).map((reminder) =>
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
      let snapshot: Reminder;
      try {
        snapshot = copyReminder(reminder);
      } catch {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned invalid data.",
        );
      }
      if (!isValidReminder(snapshot) || snapshot.id !== validId.value) {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned invalid data.",
        );
      }
      reminder = snapshot;
      if (reminder.status === "cancelled") {
        return {
          ok: true,
          value: {
            outcome: "already-cancelled",
            reminder: copyReminder(reminder),
          },
        };
      }
      if (reminder.status === "sent") {
        return failure(
          "REMINDER_NOT_CANCELLABLE",
          "A sent reminder cannot be cancelled.",
        );
      }
      if (reminder.status === "dispatching") {
        return failure(
          "REMINDER_NOT_CANCELLABLE",
          "A dispatching reminder cannot be cancelled.",
        );
      }
      const timestamp = currentTimestamp(now);
      if (!timestamp.ok) {
        return timestamp;
      }
      const cancelled: CancelledReminder = {
        id: reminder.id,
        appointmentId: reminder.appointmentId,
        remindAt: reminder.remindAt,
        channel: reminder.channel,
        details: { ...reminder.details },
        createdAt: reminder.createdAt,
        attemptCount: reminder.attemptCount,
        status: "cancelled",
        cancelledAt: timestamp.value.iso,
        cancellationReason: "requested",
      };
      let outcome: "updated" | "not-found" | "state-conflict";
      try {
        outcome = await storage.replace(
          reminder.id,
          reminder.status,
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

    async dispatchDue(): Promise<ReminderResult<DispatchReport>> {
      const timestamp = currentTimestamp(now);
      if (!timestamp.ok) {
        return timestamp;
      }
      let reminders: readonly Reminder[];
      try {
        reminders = await storage.list();
      } catch {
        return failure("STORAGE_FAILURE", "Reminder storage failed.");
      }
      const snapshots = validatedStorageRecords(reminders);
      if (snapshots === null) {
        return failure(
          "STORAGE_FAILURE",
          "Reminder storage returned invalid data.",
        );
      }
      const due = sortReminders(snapshots).filter(
        (reminder) =>
          (reminder.status === "scheduled" || reminder.status === "failed") &&
          Date.parse(reminder.remindAt) <= timestamp.value.epoch,
      );
      const outcomes: DispatchOutcome[] = [];

      for (const reminder of due) {
        let appointment: AgendaAppointment | null;
        try {
          appointment = await agendaSource.getAppointment(
            reminder.appointmentId,
          );
        } catch {
          outcomes.push({
            reminderId: reminder.id,
            outcome: "skipped",
            reason: "agenda-unavailable",
          });
          continue;
        }
        if (appointment === null) {
          const cancelled: CancelledReminder = {
            id: reminder.id,
            appointmentId: reminder.appointmentId,
            remindAt: reminder.remindAt,
            channel: reminder.channel,
            details: { ...reminder.details },
            createdAt: reminder.createdAt,
            attemptCount: reminder.attemptCount,
            status: "cancelled",
            cancelledAt: timestamp.value.iso,
            cancellationReason: "appointment-missing",
          };
          let cancelledOutcome: "updated" | "not-found" | "state-conflict";
          try {
            cancelledOutcome = await storage.replace(
              reminder.id,
              reminder.status,
              copyReminder(cancelled),
            );
          } catch {
            return failure("STORAGE_FAILURE", "Reminder storage failed.");
          }
          outcomes.push(
            cancelledOutcome === "updated"
              ? {
                  reminderId: reminder.id,
                  outcome: "cancelled",
                  reason: "appointment-missing",
                }
              : {
                  reminderId: reminder.id,
                  outcome: "skipped",
                  reason: "state-changed",
                },
          );
          continue;
        }
        const validAppointment = validateAppointment(
          appointment,
          reminder.appointmentId,
        );
        if (!validAppointment.ok) {
          outcomes.push({
            reminderId: reminder.id,
            outcome: "skipped",
            reason: "agenda-unavailable",
          });
          continue;
        }

        const dispatching: DispatchingReminder = {
          id: reminder.id,
          appointmentId: reminder.appointmentId,
          remindAt: reminder.remindAt,
          channel: reminder.channel,
          details: { ...reminder.details },
          createdAt: reminder.createdAt,
          attemptCount: reminder.attemptCount + 1,
          status: "dispatching",
          lastAttemptAt: timestamp.value.iso,
        };
        let claimOutcome: "updated" | "not-found" | "state-conflict";
        try {
          claimOutcome = await storage.replace(
            reminder.id,
            reminder.status,
            copyReminder(dispatching),
          );
        } catch {
          return failure("STORAGE_FAILURE", "Reminder storage failed.");
        }
        if (claimOutcome !== "updated") {
          outcomes.push({
            reminderId: reminder.id,
            outcome: "skipped",
            reason: "state-changed",
          });
          continue;
        }

        const message = buildReminderMessage(
          dispatching,
          validAppointment.value,
        );
        let senderResult: unknown;
        try {
          senderResult = await sender.send(copyMessage(message));
        } catch {
          senderResult = null;
        }
        const accepted = validSenderResult(senderResult);
        if (accepted?.ok === true) {
          const sent: SentReminder = {
            id: dispatching.id,
            appointmentId: dispatching.appointmentId,
            remindAt: dispatching.remindAt,
            channel: dispatching.channel,
            details: { ...dispatching.details },
            createdAt: dispatching.createdAt,
            attemptCount: dispatching.attemptCount,
            status: "sent",
            sentAt: timestamp.value.iso,
          };
          try {
            const sentOutcome = await storage.replace(
              reminder.id,
              "dispatching",
              copyReminder(sent),
            );
            if (sentOutcome !== "updated") {
              return failure(
                "STORAGE_FAILURE",
                "Reminder state changed after delivery.",
              );
            }
          } catch {
            return failure("STORAGE_FAILURE", "Reminder storage failed.");
          }
          outcomes.push({ reminderId: reminder.id, outcome: "sent" });
          continue;
        }

        const failed: FailedReminder = {
          id: dispatching.id,
          appointmentId: dispatching.appointmentId,
          remindAt: dispatching.remindAt,
          channel: dispatching.channel,
          details: { ...dispatching.details },
          createdAt: dispatching.createdAt,
          attemptCount: dispatching.attemptCount,
          status: "failed",
          failedAt: timestamp.value.iso,
          failureReason: "delivery-failed",
        };
        try {
          const failedOutcome = await storage.replace(
            reminder.id,
            "dispatching",
            copyReminder(failed),
          );
          if (failedOutcome !== "updated") {
            return failure(
              "STORAGE_FAILURE",
              "Reminder state changed after delivery failure.",
            );
          }
        } catch {
          return failure("STORAGE_FAILURE", "Reminder storage failed.");
        }
        outcomes.push({
          reminderId: reminder.id,
          outcome: "failed",
          reason: "delivery-failed",
        });
      }

      return {
        ok: true,
        value: { dispatchedAt: timestamp.value.iso, outcomes },
      };
    },
  };
}

function validSenderResult(value: unknown): ReminderSenderResult | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  try {
    const keys = Object.keys(value);
    if (keys.length !== 1 || keys[0] !== "ok") {
      return null;
    }
    const ok = Reflect.get(value, "ok");
    return ok === true ? { ok: true } : ok === false ? { ok: false } : null;
  } catch {
    return null;
  }
}
