import { describe, expect, it } from "vitest";

import {
  agendaLimits,
  ScriptedCalendarGateway,
  type CalendarGatewayRequest,
  type ConfirmedAppointment,
  type ScriptedCalendarGatewayOptions,
  type ScriptedCalendarGatewayStep,
} from "./index.ts";

const appointment = (id: string): ConfirmedAppointment => ({
  id,
  confirmation: { status: "confirmed", reference: `confirmation-${id}` },
  practitioner: { name: "Dr Synthetic" },
  startsAt: "2026-12-10T09:00:00+01:00",
  endsAt: "2026-12-10T09:30:00+01:00",
  location: { kind: "remote", label: "Synthetic room" },
});

const request = (id: string): CalendarGatewayRequest => ({
  idempotencyKey: id,
  appointment: appointment(id),
});

const syncedStep = (): ScriptedCalendarGatewayStep => ({
  type: "synced",
  externalEventId: "external-event-1",
  syncedAt: "2026-11-27T09:00:00Z",
});

const options = (
  steps: readonly ScriptedCalendarGatewayStep[] = [syncedStep()],
  idempotencyKey = "appointment-1",
): ScriptedCalendarGatewayOptions => ({
  scenarios: [{ idempotencyKey, steps }],
});

describe("ScriptedCalendarGateway", () => {
  it("consumes steps in order and rejects an exhausted scenario", async () => {
    const gateway = new ScriptedCalendarGateway(
      options([syncedStep(), { type: "rejected" }]),
    );

    await expect(gateway.upsert(request("appointment-1"))).resolves.toEqual({
      status: "synced",
      externalEventId: "external-event-1",
      syncedAt: "2026-11-27T09:00:00Z",
    });
    await expect(gateway.upsert(request("appointment-1"))).resolves.toEqual({
      status: "rejected",
    });
    await expect(gateway.upsert(request("appointment-1"))).resolves.toEqual({
      status: "rejected",
    });
  });

  it("rejects an unknown scenario", async () => {
    const gateway = new ScriptedCalendarGateway({ scenarios: [] });

    await expect(gateway.upsert(request("unknown"))).resolves.toEqual({
      status: "rejected",
    });
  });

  it("records a failure before throwing a generic error", async () => {
    const gateway = new ScriptedCalendarGateway(options([{ type: "failure" }]));

    await expect(gateway.upsert(request("appointment-1"))).rejects.toThrow(
      "scripted calendar gateway failure",
    );
    expect(gateway.getHistory()).toEqual([request("appointment-1")]);
  });

  it("bounds history and removes the oldest request", async () => {
    const gateway = new ScriptedCalendarGateway({
      scenarios: [],
      historyLimit: 2,
    });

    await gateway.upsert(request("appointment-1"));
    await gateway.upsert(request("appointment-2"));
    await gateway.upsert(request("appointment-3"));

    expect(gateway.getHistory()).toEqual([
      request("appointment-2"),
      request("appointment-3"),
    ]);
  });

  it("copies history and configuration defensively", async () => {
    const step = syncedStep();
    const configured = options([step]);
    const gateway = new ScriptedCalendarGateway(configured);
    Reflect.set(step, "externalEventId", "mutated configuration");
    const sent = request("appointment-1");

    await expect(gateway.upsert(sent)).resolves.toMatchObject({
      externalEventId: "external-event-1",
    });
    sent.appointment.practitioner.name = "mutated request";
    const history = gateway.getHistory();
    const first = history[0];
    if (first !== undefined) first.appointment.practitioner.name = "mutated history";
    expect(gateway.getHistory()[0]?.appointment.practitioner.name).toBe(
      "Dr Synthetic",
    );
  });

  it("rejects duplicate and empty scenarios", () => {
    const duplicate = {
      idempotencyKey: "appointment-1",
      steps: [syncedStep()],
    };
    expect(
      () =>
        new ScriptedCalendarGateway({
          scenarios: [duplicate, duplicate],
        }),
    ).toThrow("invalid scripted calendar gateway configuration");
    expect(
      () =>
        new ScriptedCalendarGateway({
          scenarios: [{ idempotencyKey: "appointment-1", steps: [] }],
        }),
    ).toThrow("invalid scripted calendar gateway configuration");
  });

  it.each(["", "x".repeat(agendaLimits.appointmentIdLength + 1)])(
    "rejects an invalid scenario key",
    (idempotencyKey) => {
      expect(
        () => new ScriptedCalendarGateway(options(undefined, idempotencyKey)),
      ).toThrow("invalid scripted calendar gateway configuration");
    },
  );

  it("rejects unexpected option and scenario properties", () => {
    const extraOptions = Object.assign({ scenarios: [] }, { extra: true });
    const extraScenario = Object.assign(
      { idempotencyKey: "appointment-1", steps: [syncedStep()] },
      { extra: true },
    );

    expect(() => new ScriptedCalendarGateway(extraOptions)).toThrow();
    expect(
      () => new ScriptedCalendarGateway({ scenarios: [extraScenario] }),
    ).toThrow();
  });

  it("rejects extended and unknown steps", () => {
    const extended = { type: "rejected", extra: true } as const;
    const unknown: ScriptedCalendarGatewayStep = { type: "rejected" };
    Reflect.set(unknown, "type", "unknown");

    expect(() => new ScriptedCalendarGateway(options([extended]))).toThrow();
    expect(() => new ScriptedCalendarGateway(options([unknown]))).toThrow();
  });

  it.each(["2026-11-27T09:00:00", "2026-02-30T09:00:00Z"])(
    "rejects invalid scripted timestamps",
    (syncedAt) => {
      expect(
        () =>
          new ScriptedCalendarGateway(
            options([
              {
                type: "synced",
                externalEventId: "external-event-1",
                syncedAt,
              },
            ]),
          ),
      ).toThrow("invalid scripted calendar gateway configuration");
    },
  );

  it.each(["", "x".repeat(agendaLimits.calendarExternalEventIdLength + 1)])(
    "rejects invalid external event identifiers",
    (externalEventId) => {
      expect(
        () =>
          new ScriptedCalendarGateway(
            options([
              {
                type: "synced",
                externalEventId,
                syncedAt: "2026-11-27T09:00:00Z",
              },
            ]),
          ),
      ).toThrow("invalid scripted calendar gateway configuration");
    },
  );

  it.each([
    0,
    1.5,
    agendaLimits.scriptedCalendarGatewayHistoryLength + 1,
  ])("rejects an invalid custom history limit", (historyLimit) => {
    expect(
      () => new ScriptedCalendarGateway({ scenarios: [], historyLimit }),
    ).toThrow("invalid scripted calendar gateway configuration");
  });

  it("enforces the public scenario and step limits", () => {
    const tooManyScenarios = Array.from(
      { length: agendaLimits.scriptedCalendarGatewayScenarioCount + 1 },
      (_, index) => ({
        idempotencyKey: `appointment-${index}`,
        steps: [syncedStep()],
      }),
    );
    const tooManySteps = Array.from(
      { length: agendaLimits.scriptedCalendarGatewayStepsPerScenario + 1 },
      () => syncedStep(),
    );

    expect(
      () => new ScriptedCalendarGateway({ scenarios: tooManyScenarios }),
    ).toThrow();
    expect(() => new ScriptedCalendarGateway(options(tooManySteps))).toThrow();
  });
});
