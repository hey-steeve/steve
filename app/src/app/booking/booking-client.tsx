"use client";

import {
  bookAppointment,
  ScriptedPracticeCaller,
  type BookingResult,
  type PractitionerCandidate,
  type ScriptedPracticeScenario,
} from "@steve/booking";
import type { Practitioner } from "@steve/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { demoPractitioners } from "../directory/demo-practitioners";
import {
  CalendarIcon,
  CheckIcon,
  FeatureShell,
  PinIcon,
  UserIcon,
} from "../feature-shell";
import "./booking.css";

type ScenarioId = "confirm-first" | "fallback-second" | "all-refused";
type BookingPhase = "confirmed" | "calling" | "not-confirmed";

const scenarioOrder: readonly ScenarioId[] = [
  "confirm-first",
  "fallback-second",
  "all-refused",
];

const scenarioLabels: Record<ScenarioId, string> = {
  "confirm-first": "Confirmation directe",
  "fallback-second": "2e praticien si refus",
  "all-refused": "Aucun créneau libre",
};

const attemptStatusLabel: Record<string, string> = {
  confirmed: "Créneau confirmé",
  refused: "Refusé",
  unavailable: "Indisponible",
  "invalid-response": "Réponse invalide",
  "caller-error": "Erreur d’appel",
};

const requestedWindow = {
  startsAt: "2026-12-02T09:00:00+01:00",
  endsAt: "2026-12-02T17:00:00+01:00",
} as const;

const defaultConfirmedSlot = {
  startsAt: "2026-12-02T10:00:00+01:00",
  endsAt: "2026-12-02T10:30:00+01:00",
} as const;

const fallbackConfirmedSlot = {
  startsAt: "2026-12-02T14:00:00+01:00",
  endsAt: "2026-12-02T14:30:00+01:00",
} as const;

function pickPractitioner(rpps: string | undefined): Practitioner {
  const found = demoPractitioners.find((item) => item.rpps === rpps);
  const first = demoPractitioners[0];
  if (first === undefined) {
    throw new Error("Missing demo practitioners");
  }
  return found ?? first;
}

function buildCandidates(primary: Practitioner): readonly Practitioner[] {
  const backup = demoPractitioners.find(
    (item) => item.rpps !== primary.rpps && item.specialtyCode === primary.specialtyCode,
  ) ?? demoPractitioners.find((item) => item.rpps !== primary.rpps);
  return backup === undefined ? [primary] : [primary, backup];
}

function toCandidate(item: Practitioner): PractitionerCandidate {
  return {
    practitionerId: item.rpps,
    displayName: `${item.firstName} ${item.lastName}`,
  };
}

function buildScenarios(
  candidates: readonly Practitioner[],
  scenario: ScenarioId,
): readonly ScriptedPracticeScenario[] {
  const first = candidates[0];
  const second = candidates[1];
  if (first === undefined) return [];
  if (scenario === "confirm-first") {
    return [
      {
        practitionerId: first.rpps,
        steps: [
          {
            kind: "confirmed",
            confirmationId: `CONF-${first.rpps.slice(-4)}`,
            slot: defaultConfirmedSlot,
          },
        ],
      },
    ];
  }
  if (scenario === "fallback-second" && second !== undefined) {
    return [
      { practitionerId: first.rpps, steps: [{ kind: "refused" }] },
      {
        practitionerId: second.rpps,
        steps: [
          {
            kind: "confirmed",
            confirmationId: `CONF-${second.rpps.slice(-4)}`,
            slot: fallbackConfirmedSlot,
          },
        ],
      },
    ];
  }
  return candidates.map((item) => ({
    practitionerId: item.rpps,
    steps: [{ kind: "refused" }],
  }));
}

function formatFrenchSlot(iso: string): string {
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

export default function BookingClient(props: {
  readonly initialPractitionerRpps?: string | undefined;
  readonly initialPhase?: BookingPhase | undefined;
  readonly callDelayMs?: number | undefined;
}) {
  const callDelayMs = props.callDelayMs ?? 450;
  const [selectedRpps, setSelectedRpps] = useState(
    () => pickPractitioner(props.initialPractitionerRpps).rpps,
  );
  const [scenario, setScenario] = useState<ScenarioId>("confirm-first");
  const initialPractitioner = pickPractitioner(props.initialPractitionerRpps);
  const [phase, setPhase] = useState<BookingPhase>(props.initialPhase ?? "confirmed");
  const [result, setResult] = useState<BookingResult>(() => ({
    kind: "confirmed",
    requestId: "req-demo-1",
    practitioner: toCandidate(initialPractitioner),
    confirmationId: `CONF-${initialPractitioner.rpps.slice(-4)}`,
    slot: defaultConfirmedSlot,
    attempts: [
      {
        kind: "confirmed",
        practitioner: toCandidate(initialPractitioner),
        confirmationId: `CONF-${initialPractitioner.rpps.slice(-4)}`,
        slot: defaultConfirmedSlot,
      },
    ],
  }));
  const runCounter = useRef(1);
  const activeRun = useRef(0);

  useEffect(() => {
    return () => {
      activeRun.current += 1;
    };
  }, []);

  const selectedPractitioner = pickPractitioner(selectedRpps);
  const confirmedPractitioner =
    result.kind === "confirmed"
      ? pickPractitioner(result.practitioner.practitionerId)
      : selectedPractitioner;

  async function runBookingCall() {
    const ticket = activeRun.current + 1;
    activeRun.current = ticket;
    runCounter.current += 1;
    setPhase("calling");

    if (callDelayMs > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, callDelayMs);
      });
    }
    if (activeRun.current !== ticket) return;

    const candidates = buildCandidates(selectedPractitioner);
    const caller = new ScriptedPracticeCaller(buildScenarios(candidates, scenario));
    const outcome = await bookAppointment(
      {
        requestId: `req-demo-${runCounter.current}`,
        requestedWindow,
      },
      candidates.map(toCandidate),
      caller,
    );
    if (activeRun.current !== ticket) return;
    setResult(outcome);
    setPhase(outcome.kind === "confirmed" ? "confirmed" : "not-confirmed");
  }

  if (phase === "calling") {
    return (
      <FeatureShell
        current="/booking"
        title="Appel au cabinet"
        heroMascot={{ src: "/mascot/state-calling.webp", width: 256, height: 256 }}
      >
        <section className="steve-card" aria-live="polite" aria-busy="true">
          <div className="steve-detail-copy">
            <h2 className="steve-card-title">
              {selectedPractitioner.firstName} {selectedPractitioner.lastName}
            </h2>
            <p className="steve-detail-secondary">{selectedPractitioner.specialtyLabel}</p>
          </div>
          <ol className="booking-steps">
            <li className="booking-step-row">
              <span className="booking-spinner" aria-hidden="true" />
              <span>Appel en cours</span>
            </li>
            <li className="booking-step-row">
              <span className="booking-pending-ring" aria-hidden="true" />
              <span>En attente de confirmation</span>
            </li>
          </ol>
        </section>
      </FeatureShell>
    );
  }

  return (
    <FeatureShell
      current="/booking"
      title="Prise de rendez-vous"
      headerMascot={{
        src: phase === "confirmed" ? "/mascot/state-done.webp" : "/mascot/state-listening.webp",
        width: 256,
        height: 256,
      }}
    >
      {phase === "confirmed" && result.kind === "confirmed" ? (
        <>
          <section className="steve-card" aria-label="Étapes de prise de rendez-vous">
            <ol className="booking-steps">
              <li className="booking-step">
                <span className="booking-check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span>Appel au cabinet</span>
              </li>
              <li className="booking-step">
                <span className="booking-check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span>Créneau confirmé</span>
              </li>
            </ol>
          </section>

          <section className="steve-card" aria-labelledby="booking-confirmed-heading">
            <span id="booking-confirmed-heading" className="steve-pill steve-pill-success">
              Rendez-vous confirmé
            </span>
            <ul className="steve-detail-list">
              <li className="steve-detail-item">
                <span className="steve-icon-badge" aria-hidden="true">
                  <UserIcon />
                </span>
                <div className="steve-detail-copy">
                  <span className="steve-detail-primary">
                    {confirmedPractitioner.firstName} {confirmedPractitioner.lastName}
                  </span>
                  <span className="steve-detail-secondary">
                    {confirmedPractitioner.specialtyLabel}
                  </span>
                </div>
              </li>
              <li className="steve-detail-item">
                <span className="steve-icon-badge" aria-hidden="true">
                  <CalendarIcon />
                </span>
                <div className="steve-detail-copy">
                  <span className="steve-detail-primary">
                    {formatFrenchSlot(result.slot.startsAt)}
                  </span>
                </div>
              </li>
              <li className="steve-detail-item">
                <span className="steve-icon-badge" aria-hidden="true">
                  <PinIcon />
                </span>
                <div className="steve-detail-copy">
                  <span className="steve-detail-primary">
                    {confirmedPractitioner.address.line}
                  </span>
                  <span className="steve-detail-secondary">
                    {confirmedPractitioner.address.postalCode} {confirmedPractitioner.address.city}
                  </span>
                </div>
              </li>
            </ul>
            <hr className="steve-divider" />
            <p className="steve-demo-note">Réf. {result.confirmationId}</p>
            <Link className="steve-btn-action" href="/agenda">
              <span className="steve-icon-circle" aria-hidden="true">
                <CalendarIcon />
              </span>
              <span>Voir dans l’agenda</span>
            </Link>
          </section>
        </>
      ) : (
        <section className="steve-card" aria-live="polite">
          <span className="steve-pill steve-pill-danger">Aucun créneau confirmé</span>
          <p className="steve-detail-secondary">
            Steve a appelé au plus 2 cabinets sans obtenir de créneau disponible. Rien n’a été ajouté à ton agenda.
          </p>
          <ul className="booking-attempt-list">
            {result.attempts.map((attempt, index) => (
              <li key={`${attempt.practitioner.practitionerId}-${index}`} className="booking-attempt-item">
                <span>{attempt.practitioner.displayName}</span>
                <span className="steve-detail-secondary">
                  {attemptStatusLabel[attempt.kind] ?? attempt.kind}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="steve-card" aria-labelledby="booking-simulator-title">
        <h2 id="booking-simulator-title" className="steve-card-title">
          Appeler un cabinet
        </h2>
        <div className="steve-field-group">
          <label className="steve-field-label" htmlFor="booking-practitioner">
            Praticien choisi
          </label>
          <select
            id="booking-practitioner"
            className="steve-select"
            value={selectedRpps}
            onChange={(event) => setSelectedRpps(event.target.value)}
          >
            {demoPractitioners.map((item) => (
              <option key={item.rpps} value={item.rpps}>
                {item.firstName} {item.lastName} · {item.specialtyLabel}
              </option>
            ))}
          </select>
        </div>
        <div className="steve-field-group">
          <span className="steve-field-label">Scénario d’appel</span>
          <div className="booking-scenarios" role="group" aria-label="Scénario d’appel">
            {scenarioOrder.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={scenario === id}
                onClick={() => setScenario(id)}
              >
                {scenarioLabels[id]}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="steve-btn-primary"
          onClick={() => {
            void runBookingCall();
          }}
        >
          Lancer l’appel au cabinet
        </button>
      </section>
    </FeatureShell>
  );
}
