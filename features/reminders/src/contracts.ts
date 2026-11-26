export const reminderChannels = Object.freeze(["sms", "call"] as const);

export type ReminderChannel = (typeof reminderChannels)[number];

export const reminderLimits = Object.freeze({
  identifierCharacters: 64,
  appointmentTitleCharacters: 160,
  appointmentLocationCharacters: 300,
  medicationInstructionCharacters: 500,
  storedReminders: 1_000,
} as const);

export type AgendaAppointment = {
  readonly id: string;
  readonly startAt: string;
  readonly title?: string;
  readonly location?: string;
};

export interface AgendaSource {
  getAppointment(appointmentId: string): Promise<AgendaAppointment | null>;
}

export type AppointmentReminderInput = {
  readonly type: "appointment";
};

export type MedicationReminderInput = {
  readonly type: "medication";
  readonly instruction: string;
};

export type ReminderDetailsInput =
  | AppointmentReminderInput
  | MedicationReminderInput;

export type ScheduleReminderInput = {
  readonly appointmentId: string;
  readonly remindAt: string;
  readonly channel: ReminderChannel;
  readonly details: ReminderDetailsInput;
};

export type ReminderDetails =
  | { readonly type: "appointment" }
  | { readonly type: "medication"; readonly instruction: string };

type ReminderBase = {
  readonly id: string;
  readonly appointmentId: string;
  readonly remindAt: string;
  readonly channel: ReminderChannel;
  readonly details: ReminderDetails;
  readonly createdAt: string;
};

export type ScheduledReminder = ReminderBase & {
  readonly status: "scheduled";
};

export type CancelledReminder = ReminderBase & {
  readonly status: "cancelled";
  readonly cancelledAt: string;
  readonly cancellationReason: "requested" | "appointment-missing";
};

export type Reminder = ScheduledReminder | CancelledReminder;
export type ReminderStatus = Reminder["status"];

export type ReminderStorageCreateResult =
  | "created"
  | "duplicate"
  | "full";

export type ReminderStorageReplaceResult =
  | "updated"
  | "not-found"
  | "state-conflict";

export interface ReminderStorage {
  create(reminder: ScheduledReminder): Promise<ReminderStorageCreateResult>;
  get(id: string): Promise<Reminder | null>;
  list(): Promise<readonly Reminder[]>;
  replace(
    id: string,
    expectedStatus: ReminderStatus,
    reminder: Reminder,
  ): Promise<ReminderStorageReplaceResult>;
}

export type ReminderErrorCode =
  | "INVALID_INPUT"
  | "INVALID_REMINDER_TIME"
  | "APPOINTMENT_NOT_FOUND"
  | "DUPLICATE_REMINDER"
  | "REMINDER_NOT_FOUND"
  | "STORAGE_FULL"
  | "STORAGE_FAILURE"
  | "AGENDA_FAILURE"
  | "CLOCK_FAILURE"
  | "DEPENDENCY_FAILURE";

export type ReminderError = {
  readonly code: ReminderErrorCode;
  readonly message: string;
  readonly field?: string;
};

export type ReminderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ReminderError };

export type CancelReminderOutcome =
  | { readonly outcome: "cancelled"; readonly reminder: CancelledReminder }
  | {
      readonly outcome: "already-cancelled";
      readonly reminder: CancelledReminder;
    };

export type ReminderDependencies = {
  readonly agendaSource: AgendaSource;
  readonly storage: ReminderStorage;
  readonly now: () => Date;
  readonly generateId?: () => string;
};

export interface ReminderService {
  schedule(
    input: ScheduleReminderInput,
  ): Promise<ReminderResult<ScheduledReminder>>;
  list(): Promise<ReminderResult<readonly Reminder[]>>;
  cancel(id: string): Promise<ReminderResult<CancelReminderOutcome>>;
}
