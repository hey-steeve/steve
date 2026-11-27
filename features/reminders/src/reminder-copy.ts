import type {
  CancelledReminder,
  DispatchingReminder,
  FailedReminder,
  Reminder,
  ReminderDetails,
  ScheduledReminder,
  SentReminder,
} from "./contracts.ts";

export function copyDetails(details: ReminderDetails): ReminderDetails {
  const type = details.type;
  return type === "appointment"
    ? { type: "appointment" }
    : { type: "medication", instruction: details.instruction };
}

export function copyReminder(reminder: ScheduledReminder): ScheduledReminder;
export function copyReminder(reminder: CancelledReminder): CancelledReminder;
export function copyReminder(reminder: DispatchingReminder): DispatchingReminder;
export function copyReminder(reminder: SentReminder): SentReminder;
export function copyReminder(reminder: FailedReminder): FailedReminder;
export function copyReminder(reminder: Reminder): Reminder;
export function copyReminder(reminder: Reminder): Reminder {
  const id = reminder.id;
  const appointmentId = reminder.appointmentId;
  const remindAt = reminder.remindAt;
  const channel = reminder.channel;
  const details = copyDetails(reminder.details);
  const createdAt = reminder.createdAt;
  const attemptCount = reminder.attemptCount;
  const status = reminder.status;
  const base = {
    id,
    appointmentId,
    remindAt,
    channel,
    details,
    createdAt,
    attemptCount,
  };
  if (status === "scheduled") {
    return { ...base, status };
  }
  if (status === "cancelled") {
    const cancelledAt = reminder.cancelledAt;
    const cancellationReason = reminder.cancellationReason;
    return { ...base, status, cancelledAt, cancellationReason };
  }
  if (status === "dispatching") {
    const lastAttemptAt = reminder.lastAttemptAt;
    return { ...base, status, lastAttemptAt };
  }
  if (status === "sent") {
    const sentAt = reminder.sentAt;
    return { ...base, status, sentAt };
  }
  const failedAt = reminder.failedAt;
  const failureReason = reminder.failureReason;
  return { ...base, status, failedAt, failureReason };
}
