import {
  reminderLimits,
  type Reminder,
  type ReminderStatus,
  type ReminderStorage,
  type ReminderStorageCreateResult,
  type ReminderStorageReplaceResult,
  type ScheduledReminder,
} from "./contracts.ts";
import { copyReminder } from "./reminder-copy.ts";

function deduplicationKey(reminder: Reminder): string {
  return JSON.stringify([
    reminder.appointmentId,
    reminder.details.type,
    reminder.channel,
    reminder.remindAt,
  ]);
}

export class InMemoryReminderStorage implements ReminderStorage {
  readonly #reminders = new Map<string, Reminder>();
  readonly #deduplicationKeys = new Set<string>();
  readonly #capacity: number;

  constructor(capacity: number = reminderLimits.storedReminders) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      capacity > reminderLimits.storedReminders
    ) {
      throw new RangeError(
        `capacity must be between 1 and ${reminderLimits.storedReminders}.`,
      );
    }
    this.#capacity = capacity;
  }

  async create(
    reminder: ScheduledReminder,
  ): Promise<ReminderStorageCreateResult> {
    const key = deduplicationKey(reminder);
    if (this.#reminders.has(reminder.id) || this.#deduplicationKeys.has(key)) {
      return "duplicate";
    }
    if (this.#reminders.size >= this.#capacity) {
      return "full";
    }
    this.#reminders.set(reminder.id, copyReminder(reminder));
    this.#deduplicationKeys.add(key);
    return "created";
  }

  async get(id: string): Promise<Reminder | null> {
    const reminder = this.#reminders.get(id);
    return reminder === undefined ? null : copyReminder(reminder);
  }

  async list(): Promise<readonly Reminder[]> {
    return [...this.#reminders.values()].map((reminder) =>
      copyReminder(reminder),
    );
  }

  async replace(
    id: string,
    expectedStatus: ReminderStatus,
    reminder: Reminder,
  ): Promise<ReminderStorageReplaceResult> {
    const current = this.#reminders.get(id);
    if (current === undefined) {
      return "not-found";
    }
    if (current.status !== expectedStatus) {
      return "state-conflict";
    }
    this.#reminders.set(id, copyReminder(reminder));
    return "updated";
  }
}
