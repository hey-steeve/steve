export const agendaLimits = {
  appointmentIdLength: 128,
  confirmationReferenceLength: 256,
  practitionerNameLength: 200,
  locationLength: 500,
  dateTimeLength: 40,
  calendarExternalEventIdLength: 256,
  scriptedCalendarGatewayScenarioCount: 100,
  scriptedCalendarGatewayStepsPerScenario: 100,
  scriptedCalendarGatewayHistoryLength: 1_000,
  defaultScriptedCalendarGatewayHistoryLength: 100,
  defaultAppointments: 1_000,
  maximumConfigurableAppointments: 10_000,
} as const;

export type ConfirmationStatus =
  | "confirmed"
  | "provisional"
  | "refused"
  | "ambiguous";

export type AppointmentLocation =
  | { kind: "physical"; address: string }
  | { kind: "remote"; label?: string };

export interface AppointmentInput {
  id: string;
  confirmation: {
    status: ConfirmationStatus;
    reference?: string;
  };
  practitioner: {
    name: string;
  };
  startsAt: string;
  endsAt: string;
  location: AppointmentLocation;
}

export interface ConfirmedAppointment {
  id: string;
  confirmation: {
    status: "confirmed";
    reference: string;
  };
  practitioner: {
    name: string;
  };
  startsAt: string;
  endsAt: string;
  location: AppointmentLocation;
}

export type ValidationField =
  | "id"
  | "confirmation.reference"
  | "practitioner.name"
  | "startsAt"
  | "endsAt"
  | "location.address"
  | "location.label";

export type ValidationReason =
  | "required"
  | "invalid-format"
  | "too-long"
  | "invalid-range";

export type AgendaError =
  | {
      kind: "not-confirmed";
      status: Exclude<ConfirmationStatus, "confirmed">;
    }
  | {
      kind: "validation";
      field: ValidationField;
      reason: ValidationReason;
    }
  | { kind: "already-exists"; id: string }
  | { kind: "not-found"; id: string }
  | { kind: "capacity-reached"; limit: number }
  | { kind: "storage-error" }
  | { kind: "generation-error" };

export type AgendaResult<Value> =
  | { status: "success"; value: Value }
  | { status: "error"; error: AgendaError };

export type StorageCreateResult =
  | { status: "created" }
  | { status: "already-exists" };

export type StorageDeleteResult =
  | { status: "deleted"; appointment: ConfirmedAppointment }
  | { status: "not-found" };

export interface AppointmentStorage {
  list(): readonly ConfirmedAppointment[];
  get(id: string): ConfirmedAppointment | undefined;
  create(appointment: ConfirmedAppointment): StorageCreateResult;
  delete(id: string): StorageDeleteResult;
}

export interface AgendaClock {
  now(): Date;
}

export interface CalendarGatewayRequest {
  readonly idempotencyKey: string;
  readonly appointment: ConfirmedAppointment;
}

export interface CalendarGateway {
  upsert(request: CalendarGatewayRequest): Promise<unknown>;
}

export type CalendarGatewayResponse =
  | {
      readonly status: "synced";
      readonly externalEventId: string;
      readonly syncedAt: string;
    }
  | { readonly status: "rejected" };

export type CalendarSyncError =
  | { kind: "invalid-id" }
  | { kind: "not-configured" }
  | { kind: "not-found"; id: string }
  | { kind: "rejected" }
  | { kind: "gateway-error" }
  | { kind: "invalid-response" }
  | { kind: "storage-error" };

export type CalendarSyncResult =
  | {
      status: "success";
      value: Extract<CalendarGatewayResponse, { status: "synced" }>;
    }
  | { status: "error"; error: CalendarSyncError };

export type ScriptedCalendarGatewayStep =
  | {
      readonly type: "synced";
      readonly externalEventId: string;
      readonly syncedAt: string;
    }
  | { readonly type: "rejected" }
  | { readonly type: "failure" };

export interface ScriptedCalendarGatewayScenario {
  readonly idempotencyKey: string;
  readonly steps: readonly ScriptedCalendarGatewayStep[];
}

export interface ScriptedCalendarGatewayOptions {
  readonly scenarios: readonly ScriptedCalendarGatewayScenario[];
  readonly historyLimit?: number;
}

export type ScriptedCalendarGatewayHistoryEntry = CalendarGatewayRequest;

export interface Agenda {
  register(input: AppointmentInput): AgendaResult<ConfirmedAppointment>;
  get(id: string): AgendaResult<ConfirmedAppointment>;
  list(): AgendaResult<readonly ConfirmedAppointment[]>;
  remove(id: string): AgendaResult<ConfirmedAppointment>;
  exportIcs(id: string): AgendaResult<string>;
  syncCalendar(id: string): Promise<CalendarSyncResult>;
}
