import type {
  AgendaAppointment,
  DispatchingReminder,
  ReminderMessage,
} from "./contracts.ts";

export function buildReminderMessage(
  reminder: DispatchingReminder,
  appointment: AgendaAppointment,
): ReminderMessage {
  let body: string;
  if (reminder.details.type === "medication") {
    body = `Medication reminder: ${reminder.details.instruction}`;
  } else {
    const title = appointment.title === undefined
      ? ""
      : ` ${appointment.title}.`;
    const location = appointment.location === undefined
      ? ""
      : ` Location: ${appointment.location}.`;
    body = `Appointment reminder: ${appointment.startAt}.${title}${location}`;
  }
  return {
    reminderId: reminder.id,
    appointmentId: reminder.appointmentId,
    channel: reminder.channel,
    body,
  };
}

export function copyMessage(message: ReminderMessage): ReminderMessage {
  return { ...message };
}
