import { copyAppointment } from "./copy.ts";
import type {
  AppointmentStorage,
  ConfirmedAppointment,
  StorageCreateResult,
  StorageDeleteResult,
} from "./types.ts";

export class InMemoryAppointmentStorage implements AppointmentStorage {
  readonly #appointments = new Map<string, ConfirmedAppointment>();

  list(): readonly ConfirmedAppointment[] {
    return [...this.#appointments.values()].map(copyAppointment);
  }

  get(id: string): ConfirmedAppointment | undefined {
    const appointment = this.#appointments.get(id);
    return appointment === undefined ? undefined : copyAppointment(appointment);
  }

  create(appointment: ConfirmedAppointment): StorageCreateResult {
    if (this.#appointments.has(appointment.id)) {
      return { status: "already-exists" };
    }

    this.#appointments.set(appointment.id, copyAppointment(appointment));
    return { status: "created" };
  }

  delete(id: string): StorageDeleteResult {
    const appointment = this.#appointments.get(id);
    if (appointment === undefined) {
      return { status: "not-found" };
    }

    this.#appointments.delete(id);
    return { status: "deleted", appointment: copyAppointment(appointment) };
  }
}
