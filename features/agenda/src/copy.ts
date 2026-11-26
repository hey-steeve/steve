import type { AppointmentLocation, ConfirmedAppointment } from "./types.ts";

const copyLocation = (location: AppointmentLocation): AppointmentLocation =>
  location.kind === "physical"
    ? { kind: "physical", address: location.address }
    : location.label === undefined
      ? { kind: "remote" }
      : { kind: "remote", label: location.label };

export const copyAppointment = (
  appointment: ConfirmedAppointment,
): ConfirmedAppointment => ({
  id: appointment.id,
  confirmation: {
    status: "confirmed",
    reference: appointment.confirmation.reference,
  },
  practitioner: { name: appointment.practitioner.name },
  startsAt: appointment.startsAt,
  endsAt: appointment.endsAt,
  location: copyLocation(appointment.location),
});
