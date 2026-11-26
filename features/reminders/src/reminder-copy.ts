import type { Reminder, ReminderDetails } from "./contracts.ts";

export function copyDetails(details: ReminderDetails): ReminderDetails {
  return details.type === "appointment"
    ? { type: "appointment" }
    : { type: "medication", instruction: details.instruction };
}

export function copyReminder<T extends Reminder>(reminder: T): T {
  return { ...reminder, details: copyDetails(reminder.details) };
}
