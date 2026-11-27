import { copyAppointment } from "./copy.ts";
import { validateCalendarGatewayResponse } from "./calendar-sync.ts";
import { generateAppointmentIcs } from "./ics.ts";
import {
  agendaLimits,
  type Agenda,
  type AgendaClock,
  type AgendaResult,
  type AppointmentInput,
  type AppointmentStorage,
  type ConfirmedAppointment,
  type CalendarGateway,
  type CalendarGatewayResponse,
  type CalendarSyncResult,
} from "./types.ts";
import {
  errorResult,
  generationError,
  storageError,
  validateAppointment,
  validateAppointmentId,
} from "./validation.ts";

export interface CreateAgendaOptions {
  storage: AppointmentStorage;
  clock: AgendaClock;
  calendarGateway?: CalendarGateway;
  maximumAppointments?: number;
}

const success = <Value>(value: Value): AgendaResult<Value> => ({
  status: "success",
  value,
});

const validateMaximumAppointments = (value: number): number => {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > agendaLimits.maximumConfigurableAppointments
  ) {
    throw new RangeError("maximumAppointments is outside the supported range");
  }
  return value;
};

export const createAgenda = (options: CreateAgendaOptions): Agenda => {
  const maximumAppointments = validateMaximumAppointments(
    options.maximumAppointments ?? agendaLimits.defaultAppointments,
  );

  const register = (
    input: AppointmentInput,
  ): AgendaResult<ConfirmedAppointment> => {
    const validated = validateAppointment(input);
    if (validated.status === "error") {
      return validated;
    }

    try {
      const appointments = options.storage.list();
      if (appointments.some(({ id }) => id === validated.value.id)) {
        return errorResult({ kind: "already-exists", id: validated.value.id });
      }
      if (appointments.length >= maximumAppointments) {
        return errorResult({
          kind: "capacity-reached",
          limit: maximumAppointments,
        });
      }

      const created = options.storage.create(copyAppointment(validated.value));
      if (created.status === "already-exists") {
        return errorResult({ kind: "already-exists", id: validated.value.id });
      }
      return success(copyAppointment(validated.value));
    } catch {
      return storageError();
    }
  };

  const get = (id: string): AgendaResult<ConfirmedAppointment> => {
    const validId = validateAppointmentId(id);
    if (validId.status === "error") {
      return validId;
    }

    try {
      const appointment = options.storage.get(id);
      return appointment === undefined
        ? errorResult({ kind: "not-found", id })
        : success(copyAppointment(appointment));
    } catch {
      return storageError();
    }
  };

  const list = (): AgendaResult<readonly ConfirmedAppointment[]> => {
    try {
      const appointments = options.storage
        .list()
        .map(copyAppointment)
        .sort(
          (left, right) =>
            Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
            (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
        );
      return success(appointments);
    } catch {
      return storageError();
    }
  };

  const remove = (id: string): AgendaResult<ConfirmedAppointment> => {
    const validId = validateAppointmentId(id);
    if (validId.status === "error") {
      return validId;
    }

    try {
      const deleted = options.storage.delete(id);
      return deleted.status === "not-found"
        ? errorResult({ kind: "not-found", id })
        : success(copyAppointment(deleted.appointment));
    } catch {
      return storageError();
    }
  };

  const exportIcs = (id: string): AgendaResult<string> => {
    const appointment = get(id);
    if (appointment.status === "error") {
      return appointment;
    }

    try {
      return success(generateAppointmentIcs(appointment.value, options.clock));
    } catch {
      return generationError();
    }
  };

  const syncCalendar = async (id: string): Promise<CalendarSyncResult> => {
    if (validateAppointmentId(id).status === "error") {
      return { status: "error", error: { kind: "invalid-id" } };
    }
    if (options.calendarGateway === undefined) {
      return { status: "error", error: { kind: "not-configured" } };
    }
    let appointment: ConfirmedAppointment | undefined;
    try {
      appointment = options.storage.get(id);
    } catch {
      return { status: "error", error: { kind: "storage-error" } };
    }
    if (appointment === undefined) {
      return { status: "error", error: { kind: "not-found", id } };
    }
    let response: unknown;
    try {
      response = await options.calendarGateway.upsert({
        idempotencyKey: appointment.id,
        appointment: copyAppointment(appointment),
      });
    } catch {
      return { status: "error", error: { kind: "gateway-error" } };
    }
    let validated: CalendarGatewayResponse | undefined;
    try {
      validated = validateCalendarGatewayResponse(response);
    } catch {
      return { status: "error", error: { kind: "invalid-response" } };
    }
    if (validated === undefined) {
      return { status: "error", error: { kind: "invalid-response" } };
    }
    return validated.status === "rejected"
      ? { status: "error", error: { kind: "rejected" } }
      : { status: "success", value: { ...validated } };
  };

  return { register, get, list, remove, exportIcs, syncCalendar };
};
