"use client";

import { heroSrc } from "../../chat/faces";
import { createAgenda, InMemoryAppointmentStorage } from "@steve/agenda";
import {
  createReminderService,
  InMemoryReminderStorage,
  ScriptedReminderSender,
  type Reminder,
  type ReminderChannel,
} from "@steve/reminders";
import { useEffect, useRef, useState } from "react";
import {
  BellIcon,
  CalendarIcon,
  EditIcon,
  FeatureShell,
  MessageIcon,
  PhoneOutlineIcon,
} from "../feature-shell";
import "./reminders.css";

interface ReminderSlotOption {
  readonly id: string;
  readonly label: string;
  readonly remindAt: string;
  readonly displayText: string;
}

const appointmentId = "appt-demo-1";

const slotOptions: readonly ReminderSlotOption[] = [
  {
    id: "eve-18",
    label: "Day before · 6 pm",
    remindAt: "2026-12-01T18:00:00+01:00",
    displayText: "Reminder on 1 December at 6 pm",
  },
  {
    id: "morning-8",
    label: "Morning · 8 am",
    remindAt: "2026-12-02T08:00:00+01:00",
    displayText: "Reminder on 2 December at 8 am",
  },
  {
    id: "eve-20",
    label: "Day before · 8 pm",
    remindAt: "2026-12-01T20:00:00+01:00",
    displayText: "Reminder on 1 December at 8 pm",
  },
];

const channelLabels: Record<ReminderChannel, string> = {
  sms: "By text",
  call: "By call",
};

const channelOrder: readonly ReminderChannel[] = ["sms", "call"];

function createDemoReminderRuntime() {
  const agenda = createAgenda({
    storage: new InMemoryAppointmentStorage(),
    clock: { now: () => new Date("2026-11-27T10:00:00Z") },
  });
  agenda.register({
    id: appointmentId,
    confirmation: { status: "confirmed", reference: "CONF-0001" },
    practitioner: { name: "Camille Lunéval" },
    startsAt: "2026-12-02T10:00:00+01:00",
    endsAt: "2026-12-02T10:30:00+01:00",
    location: { kind: "physical", address: "1 rue des Nuages Mauves, 75011 Paris" },
  });
  let counter = 0;
  const service = createReminderService({
    agendaSource: {
      async getAppointment(id) {
        const found = agenda.get(id);
        if (found.status === "error") return null;
        return {
          id: found.value.id,
          startAt: found.value.startsAt,
          title: `Appointment with ${found.value.practitioner.name}`,
          location:
            found.value.location.kind === "physical"
              ? found.value.location.address
              : found.value.location.label ?? "Video consultation",
        };
      },
    },
    sender: new ScriptedReminderSender([]),
    storage: new InMemoryReminderStorage(),
    now: () => new Date("2026-11-27T10:00:00Z"),
    generateId: () => {
      counter += 1;
      return `rem-demo-${counter}`;
    },
  });
  return service;
}

function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function formatReminderLine(remindAt: string): string {
  const matched = slotOptions.find((option) => sameInstant(option.remindAt, remindAt));
  if (matched !== undefined) return matched.displayText;
  const date = new Date(remindAt);
  if (Number.isNaN(date.valueOf())) return `Reminder scheduled (${remindAt})`;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Paris",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const timeText = `${Number(hour)}:${minute}`;
  return `Reminder on ${day} ${month} at ${timeText}`;
}

const initialReminder: Reminder = {
  id: "rem-demo-1",
  appointmentId,
  remindAt: "2026-12-01T18:00:00+01:00",
  channel: "sms",
  details: { type: "appointment" },
  createdAt: "2026-11-27T10:00:00.000Z",
  attemptCount: 0,
  status: "scheduled",
};

export default function RemindersClient() {
  const serviceRef = useRef<ReturnType<typeof createDemoReminderRuntime> | null>(null);
  const [activeReminder, setActiveReminder] = useState<Reminder>(initialReminder);
  const [editing, setEditing] = useState(false);
  const [draftChannel, setDraftChannel] = useState<ReminderChannel>("sms");
  const [draftRemindAt, setDraftRemindAt] = useState<string>(initialReminder.remindAt);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const service = createDemoReminderRuntime();
    serviceRef.current = service;
    void service.schedule({
      appointmentId,
      remindAt: initialReminder.remindAt,
      channel: initialReminder.channel,
      details: { type: "appointment" },
    }).then((scheduled) => {
      if (scheduled.ok) {
        setActiveReminder(scheduled.value);
      }
    });
  }, []);

  async function handleSave() {
    const service = serviceRef.current ?? createDemoReminderRuntime();
    serviceRef.current = service;
    setErrorMessage(null);
    setStatusMessage(null);

    let cancelledReminder: Reminder | null = null;
    if (activeReminder.status === "scheduled") {
      const cancelled = await service.cancel(activeReminder.id);
      if (!cancelled.ok) {
        setErrorMessage("Can’t change this reminder right now.");
        return;
      }
      cancelledReminder = cancelled.value.reminder;
    }

    const scheduled = await service.schedule({
      appointmentId,
      remindAt: draftRemindAt,
      channel: draftChannel,
      details: { type: "appointment" },
    });
    if (!scheduled.ok) {
      if (cancelledReminder !== null) setActiveReminder(cancelledReminder);
      setErrorMessage("Can’t schedule this reminder. Check the time you picked.");
      return;
    }
    setActiveReminder(scheduled.value);
    setEditing(false);
    setStatusMessage("Reminder updated.");
  }

  return (
    <FeatureShell
      current="/reminders"
      title="My reminders"
      heroMascot={{ src: heroSrc, width: 1459, height: 1078 }}
    >
      <section className="steve-card" aria-labelledby="reminder-card-title">
        <div className="reminders-pill-row">
          <span className={activeReminder.status === "scheduled" ? "steve-pill steve-pill-success" : "steve-pill"}>
            {activeReminder.status === "scheduled"
              ? "Scheduled"
              : activeReminder.status === "cancelled"
                ? "Cancelled"
                : "Updated"}
          </span>
        </div>

        <ul className="steve-detail-list">
          <li className="steve-detail-item">
            <span className="steve-icon-badge" aria-hidden="true">
              <CalendarIcon />
            </span>
            <div className="steve-detail-copy">
              <h2 id="reminder-card-title" className="reminders-title">
                Appointment with Camille Lunéval
              </h2>
              <span className="steve-detail-secondary">
                Wednesday 2 December · 10:00
              </span>
            </div>
          </li>

          <li className="steve-detail-item">
            <span className="steve-icon-badge" aria-hidden="true">
              <BellIcon />
            </span>
            <div className="steve-detail-copy">
              <span className="steve-detail-primary">
                {formatReminderLine(activeReminder.remindAt)}
              </span>
            </div>
          </li>

          <li className="steve-detail-item">
            <span className="steve-icon-badge" aria-hidden="true">
              {activeReminder.channel === "sms" ? <MessageIcon /> : <PhoneOutlineIcon />}
            </span>
            <div className="steve-detail-copy">
              <span className="steve-detail-primary">
                {channelLabels[activeReminder.channel]}
              </span>
            </div>
          </li>
        </ul>


        {editing ? (
          <div className="reminders-editor">
            <div className="steve-field-group">
              <span className="steve-field-label">Reminder channel</span>
              <div className="reminders-options" role="group" aria-label="Reminder channel">
                {channelOrder.map((channel) => (
                  <button
                    key={channel}
                    type="button"
                    aria-pressed={draftChannel === channel}
                    onClick={() => setDraftChannel(channel)}
                  >
                    {channelLabels[channel]}
                  </button>
                ))}
              </div>
            </div>

            <div className="steve-field-group">
              <span className="steve-field-label">Reminder time</span>
              <div className="reminders-options" role="group" aria-label="Reminder time">
                {slotOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={sameInstant(draftRemindAt, option.remindAt)}
                    onClick={() => setDraftRemindAt(option.remindAt)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {errorMessage === null ? null : (
              <p className="steve-alert" role="alert">
                {errorMessage}
              </p>
            )}

            <div className="reminders-actions-row">
              <button
                type="button"
                className="steve-btn-secondary"
                onClick={() => {
                  setEditing(false);
                  setErrorMessage(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="steve-btn-primary"
                onClick={() => {
                  void handleSave();
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="steve-btn-primary"
            onClick={() => {
              setDraftChannel(activeReminder.channel);
              setDraftRemindAt(activeReminder.remindAt);
              setEditing(true);
              setStatusMessage(null);
            }}
          >
            <EditIcon />
            <span>Edit the reminder</span>
          </button>
        )}

        {statusMessage === null ? null : (
          <p className="steve-status" role="status">
            {statusMessage}
          </p>
        )}
      </section>
    </FeatureShell>
  );
}
