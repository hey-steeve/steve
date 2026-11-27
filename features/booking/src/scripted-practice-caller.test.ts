import { describe, expect, it } from "vitest";

import {
  bookAppointment,
  MAX_SCRIPTED_HISTORY_ENTRIES,
  MAX_SCRIPTED_PRACTITIONERS,
  MAX_SCRIPTED_STEPS_PER_PRACTITIONER,
  ScriptedPracticeCaller,
  type AppointmentRequest,
  type PracticeCallInput,
  type PractitionerCandidate,
  type ScriptedPracticeScenario,
} from "./index.ts";

const request: AppointmentRequest = {
  requestId: "synthetic-request-001",
  requestedWindow: {
    startsAt: "2026-12-02T09:00:00+01:00",
    endsAt: "2026-12-02T18:00:00+01:00",
  },
};

const practitioners: readonly [
  PractitionerCandidate,
  PractitionerCandidate,
  PractitionerCandidate,
] = [
  { practitionerId: "synthetic-practitioner-a", displayName: "Synthetic Practice A" },
  { practitionerId: "synthetic-practitioner-b", displayName: "Synthetic Practice B" },
  { practitionerId: "synthetic-practitioner-c", displayName: "Synthetic Practice C" },
];

const confirmedStep = {
  kind: "confirmed" as const,
  confirmationId: "synthetic-confirmation-001",
  slot: {
    startsAt: "2026-12-02T10:00:00+01:00",
    endsAt: "2026-12-02T10:30:00+01:00",
  },
};

function inputFor(practitioner: PractitionerCandidate): PracticeCallInput {
  return { request, practitioner };
}

function scenario(
  practitioner: PractitionerCandidate,
  steps: ScriptedPracticeScenario["steps"],
): ScriptedPracticeScenario {
  return { practitionerId: practitioner.practitionerId, steps };
}

describe("ScriptedPracticeCaller", () => {
  it("returns a configured confirmation", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [confirmedStep]),
    ]);

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual(
      confirmedStep,
    );
  });

  it("returns a configured refusal", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [{ kind: "refused" }]),
    ]);

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual({
      kind: "refused",
    });
  });

  it("returns configured unavailability", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [{ kind: "unavailable" }]),
    ]);

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("throws a generic error for a configured failure", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [{ kind: "failure" }]),
    ]);

    await expect(caller.callPractice(inputFor(practitioners[0]))).rejects.toThrow(
      "Scripted practice call failed",
    );
  });

  it("consumes successive steps for one practitioner in order", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [
        { kind: "refused" },
        confirmedStep,
        { kind: "unavailable" },
      ]),
    ]);

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual({
      kind: "refused",
    });
    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual(
      confirmedStep,
    );
    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("returns unavailable after a sequence is exhausted", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [{ kind: "refused" }]),
    ]);

    await caller.callPractice(inputFor(practitioners[0]));

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("returns unavailable for an unknown practitioner", async () => {
    const caller = new ScriptedPracticeCaller([]);

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual({
      kind: "unavailable",
    });
  });

  it("lets booking continue from a refusal to a confirmation", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [{ kind: "refused" }]),
      scenario(practitioners[1], [confirmedStep]),
    ]);

    const result = await bookAppointment(request, practitioners, caller);

    expect(result).toMatchObject({
      kind: "confirmed",
      practitioner: practitioners[1],
      attempts: [{ kind: "refused" }, { kind: "confirmed" }],
    });
  });

  it("lets booking continue from a failure to a confirmation", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [{ kind: "failure" }]),
      scenario(practitioners[1], [confirmedStep]),
    ]);

    const result = await bookAppointment(request, practitioners, caller);

    expect(result).toMatchObject({
      kind: "confirmed",
      practitioner: practitioners[1],
      attempts: [{ kind: "caller-error" }, { kind: "confirmed" }],
    });
  });

  it("returns not-confirmed after two unavailable results", async () => {
    const caller = new ScriptedPracticeCaller([]);

    const result = await bookAppointment(request, practitioners, caller);

    expect(result).toMatchObject({
      kind: "not-confirmed",
      attempts: [{ kind: "unavailable" }, { kind: "unavailable" }],
    });
  });

  it("records call snapshots in order", async () => {
    const caller = new ScriptedPracticeCaller([]);

    await caller.callPractice(inputFor(practitioners[1]));
    await caller.callPractice(inputFor(practitioners[0]));

    expect(
      caller.getHistory().map((entry) => entry.practitioner.practitionerId),
    ).toEqual(["synthetic-practitioner-b", "synthetic-practitioner-a"]);
  });

  it("does not mutate a received call input", async () => {
    const caller = new ScriptedPracticeCaller([]);
    const mutableInput = structuredClone(inputFor(practitioners[0]));
    const originalInput = structuredClone(mutableInput);

    await caller.callPractice(mutableInput);

    expect(mutableInput).toEqual(originalInput);
  });

  it("returns defensive history copies", async () => {
    const caller = new ScriptedPracticeCaller([]);
    await caller.callPractice(inputFor(practitioners[0]));
    const history = caller.getHistory();
    const firstEntry = history[0];

    if (firstEntry === undefined) {
      throw new Error("Expected a scripted call history entry");
    }

    Reflect.set(firstEntry.request, "requestId", "mutated");
    Reflect.set(firstEntry.request.requestedWindow, "startsAt", "mutated");
    Reflect.set(firstEntry.practitioner, "displayName", "mutated");
    Reflect.set(history, 0, inputFor(practitioners[1]));

    expect(caller.getHistory()).toEqual([inputFor(practitioners[0])]);
  });

  it("copies the original configuration", async () => {
    const mutableStep = structuredClone(confirmedStep);
    const mutableScenario = {
      practitionerId: practitioners[0].practitionerId,
      steps: [mutableStep],
    };
    const caller = new ScriptedPracticeCaller([mutableScenario]);

    mutableScenario.practitionerId = "mutated";
    mutableStep.confirmationId = "mutated";
    mutableStep.slot.startsAt = "mutated";
    mutableScenario.steps.push({ ...confirmedStep });

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual(
      confirmedStep,
    );
  });

  it("returns response copies that cannot mutate later steps", async () => {
    const caller = new ScriptedPracticeCaller([
      scenario(practitioners[0], [confirmedStep, confirmedStep]),
    ]);
    const firstResponse = await caller.callPractice(inputFor(practitioners[0]));

    Reflect.set(firstResponse, "confirmationId", "mutated");
    if (firstResponse.kind === "confirmed") {
      Reflect.set(firstResponse.slot, "startsAt", "mutated");
    }

    await expect(caller.callPractice(inputFor(practitioners[0]))).resolves.toEqual(
      confirmedStep,
    );
  });

  it("rejects an invalid practitioner identifier", () => {
    expect(
      () =>
        new ScriptedPracticeCaller([
          { practitionerId: " ", steps: [{ kind: "refused" }] },
        ]),
    ).toThrow("Invalid scripted practice scenario");
  });

  it("rejects an invalid confirmed slot", () => {
    expect(
      () =>
        new ScriptedPracticeCaller([
          {
            practitionerId: practitioners[0].practitionerId,
            steps: [
              {
                kind: "confirmed",
                confirmationId: "synthetic-confirmation-001",
                slot: {
                  startsAt: "2026-12-02T10:30:00+01:00",
                  endsAt: "2026-12-02T10:00:00+01:00",
                },
              },
            ],
          },
        ]),
    ).toThrow("Invalid scripted practice step");
  });

  it("rejects too many configured practitioners", () => {
    const scenarios = Array.from(
      { length: MAX_SCRIPTED_PRACTITIONERS + 1 },
      (_, index) => ({
        practitionerId: `synthetic-practitioner-${index}`,
        steps: [{ kind: "refused" as const }],
      }),
    );

    expect(() => new ScriptedPracticeCaller(scenarios)).toThrow(
      "Invalid scripted practice scenarios",
    );
  });

  it("rejects too many steps for one practitioner", () => {
    const steps = Array.from(
      { length: MAX_SCRIPTED_STEPS_PER_PRACTITIONER + 1 },
      () => ({ kind: "refused" as const }),
    );

    expect(
      () =>
        new ScriptedPracticeCaller([
          { practitionerId: practitioners[0].practitionerId, steps },
        ]),
    ).toThrow("Invalid scripted practice scenario");
  });

  it("keeps history within the configured bound", async () => {
    const caller = new ScriptedPracticeCaller([], { historyLimit: 2 });

    await caller.callPractice(inputFor(practitioners[0]));
    await caller.callPractice(inputFor(practitioners[1]));
    await caller.callPractice(inputFor(practitioners[2]));

    expect(
      caller.getHistory().map((entry) => entry.practitioner.practitionerId),
    ).toEqual(["synthetic-practitioner-b", "synthetic-practitioner-c"]);
  });

  it("rejects an out-of-range history limit", () => {
    expect(
      () =>
        new ScriptedPracticeCaller([], {
          historyLimit: MAX_SCRIPTED_HISTORY_ENTRIES + 1,
        }),
    ).toThrow("Invalid scripted practice history limit");
  });
});
