"use client";

import {
  createAgenda,
  InMemoryAppointmentStorage,
  type ConfirmedAppointment,
} from "@steve/agenda";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BackChevronIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  FeatureShell,
  PinIcon,
  UserIcon,
} from "../feature-shell";
import "./agenda.css";

const weekdayInitials = ["L", "M", "M", "J", "V", "S", "D"] as const;

const demoSpecialties: Readonly<Record<string, string>> = {
  "Camille Lunéval": "Médecine générale",
  "Noé Brumelac": "Médecine générale",
};

function createDemoAgenda() {
  const agenda = createAgenda({
    storage: new InMemoryAppointmentStorage(),
    clock: { now: () => new Date("2026-11-27T10:00:00Z") },
  });
  agenda.register({
    id: "appt-demo-1",
    confirmation: {
      status: "confirmed",
      reference: "CONF-0001",
    },
    practitioner: {
      name: "Camille Lunéval",
    },
    startsAt: "2026-12-02T10:00:00+01:00",
    endsAt: "2026-12-02T10:30:00+01:00",
    location: {
      kind: "physical",
      address: "1 rue des Nuages Mauves\n75011 Paris",
    },
  });
  return agenda;
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(dayKey: string, delta: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDayKey(date);
}

function weekStartFor(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  const dayOfWeek = date.getUTCDay();
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + offsetToMonday);
  return toDayKey(date);
}

function weekDays(mondayKey: string): readonly { readonly key: string; readonly dayNumber: number }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDays(mondayKey, index);
    return {
      key,
      dayNumber: Number(key.slice(8, 10)),
    };
  });
}

function formatMonthYear(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatAppointmentSlot(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return iso;
  const weekday = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    timeZone: "Europe/Paris",
  }).format(date);
  const dayMonth = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  }).format(date);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Paris",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const timeText = minute === "00" ? `${Number(hour)} h` : `${Number(hour)} h ${minute}`;
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized} ${dayMonth} · ${timeText}`;
}

function splitAddress(appointment: ConfirmedAppointment): {
  readonly line1: string;
  readonly line2?: string;
} {
  if (appointment.location.kind === "remote") {
    return { line1: appointment.location.label ?? "Téléconsultation" };
  }
  const [line1 = "", line2] = appointment.location.address.split("\n");
  return line2 === undefined ? { line1 } : { line1, line2 };
}

function downloadIcs(id: string, content: string): void {
  if (typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${id}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AgendaClient() {
  const agenda = useMemo(() => createDemoAgenda(), []);
  const appointments = useMemo(() => {
    const listed = agenda.list();
    return listed.status === "success" ? listed.value : [];
  }, [agenda]);

  const [selectedDay, setSelectedDay] = useState("2026-12-02");
  const [weekStart, setWeekStart] = useState(() => weekStartFor("2026-12-02"));
  const [exportedIcs, setExportedIcs] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const days = weekDays(weekStart);
  const appointmentDays = new Set(appointments.map((item) => isoDayKey(item.startsAt)));
  const selectedAppointment =
    appointments.find((item) => isoDayKey(item.startsAt) === selectedDay) ?? null;

  function shiftWeek(deltaDays: number) {
    const nextStart = addDays(weekStart, deltaDays);
    setWeekStart(nextStart);
    setSelectedDay(addDays(selectedDay, deltaDays));
    setExportedIcs(null);
    setExportError(null);
  }

  function handleExport(appointment: ConfirmedAppointment) {
    const exported = agenda.exportIcs(appointment.id);
    if (exported.status === "error") {
      setExportError("Impossible de générer le fichier .ics pour le moment.");
      setExportedIcs(null);
      return;
    }
    setExportError(null);
    setExportedIcs(exported.value);
    downloadIcs(appointment.id, exported.value);
  }

  return (
    <FeatureShell current="/agenda" title="Mon agenda">
      <section className="steve-card" aria-label="Calendrier de la semaine">
        <div className="agenda-calendar-head">
          <button
            type="button"
            className="agenda-week-nav"
            aria-label="Semaine précédente"
            onClick={() => shiftWeek(-7)}
          >
            <BackChevronIcon />
          </button>
          <p className="agenda-month-label">{formatMonthYear(selectedDay)}</p>
          <button
            type="button"
            className="agenda-week-nav"
            aria-label="Semaine suivante"
            onClick={() => shiftWeek(7)}
          >
            <ChevronRightIcon />
          </button>
        </div>
        <div className="agenda-days-grid" role="group" aria-label="Jours de la semaine">
          {weekdayInitials.map((label, index) => (
            <span key={`${label}-${index}`} className="agenda-weekday" aria-hidden="true">
              {label}
            </span>
          ))}
          {days.map(({ key, dayNumber }) => {
            const hasAppointment = appointmentDays.has(key);
            return (
              <button
                key={key}
                type="button"
                className="agenda-day-btn"
                aria-pressed={selectedDay === key}
                aria-label={`${dayNumber} ${formatMonthYear(key)}${hasAppointment ? ", rendez-vous confirmé" : ""}`}
                onClick={() => {
                  setSelectedDay(key);
                  setExportedIcs(null);
                  setExportError(null);
                }}
              >
                <span>{dayNumber}</span>
                {hasAppointment ? <span className="agenda-day-dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      {selectedAppointment !== null ? (
        <>
          <section className="steve-card" aria-labelledby="agenda-next-title">
            <div className="steve-card-head">
              <h2 id="agenda-next-title" className="steve-card-title">
                Prochain rendez-vous
              </h2>
              <span className="steve-pill steve-pill-success">
                <CheckIcon />
                Confirmé
              </span>
            </div>
            <ul className="steve-detail-list">
              <li className="steve-detail-item">
                <span className="steve-icon-badge" aria-hidden="true">
                  <UserIcon />
                </span>
                <div className="steve-detail-copy">
                  <span className="steve-detail-primary">
                    {selectedAppointment.practitioner.name}
                  </span>
                  <span className="steve-detail-secondary">
                    {demoSpecialties[selectedAppointment.practitioner.name] ?? "Consultation"}
                  </span>
                </div>
              </li>
              <li className="steve-detail-item">
                <span className="steve-icon-badge" aria-hidden="true">
                  <CalendarIcon />
                </span>
                <div className="steve-detail-copy">
                  <span className="steve-detail-primary">
                    {formatAppointmentSlot(selectedAppointment.startsAt)}
                  </span>
                </div>
              </li>
              <li className="steve-detail-item">
                <span className="steve-icon-badge" aria-hidden="true">
                  <PinIcon />
                </span>
                <div className="steve-detail-copy">
                  <span className="steve-detail-primary">
                    {splitAddress(selectedAppointment).line1}
                  </span>
                  {splitAddress(selectedAppointment).line2 === undefined ? null : (
                    <span className="steve-detail-secondary">
                      {splitAddress(selectedAppointment).line2}
                    </span>
                  )}
                </div>
              </li>
            </ul>
          </section>

          <button
            type="button"
            className="steve-btn-action"
            onClick={() => handleExport(selectedAppointment)}
          >
            <span className="steve-icon-circle" aria-hidden="true">
              <CalendarIcon />
            </span>
            <span>Ajouter au calendrier</span>
          </button>

          {exportError === null ? null : (
            <p className="steve-alert" role="alert">{exportError}</p>
          )}
          {exportedIcs === null ? null : (
            <section className="steve-card" aria-live="polite">
              <p className="steve-status">
                Rendez-vous prêt à ajouter : ouvre le fichier téléchargé.
              </p>
              <details className="agenda-ics-details">
                <summary>Détails du fichier</summary>
                <pre className="agenda-ics-preview">{exportedIcs}</pre>
              </details>
            </section>
          )}
        </>
      ) : (
        <section className="steve-card" aria-live="polite">
          <h2 className="steve-card-title">Aucun rendez-vous confirmé ce jour</h2>
          <p className="steve-detail-secondary">
            Seuls les rendez-vous confirmés par un cabinet apparaissent dans ton agenda.
          </p>
          <button
            type="button"
            className="steve-btn-secondary"
            onClick={() => {
              setSelectedDay("2026-12-02");
              setWeekStart(weekStartFor("2026-12-02"));
            }}
          >
            Voir le 2 décembre
          </button>
          <Link className="steve-btn-primary" href="/booking">
            Prendre un rendez-vous
          </Link>
        </section>
      )}
    </FeatureShell>
  );
}
