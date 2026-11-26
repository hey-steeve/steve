import { describe, expect, it, vi } from "vitest";

import {
  bookAppointment,
  type AppointmentRequest,
  type PracticeCaller,
  type PractitionerCandidate,
} from "./index.ts";

const request: AppointmentRequest = {
  requestId: "request-001",
  requestedWindow: {
    startsAt: "2026-12-01T09:00:00+01:00",
    endsAt: "2026-12-01T18:00:00+01:00",
  },
};

const candidates: readonly PractitionerCandidate[] = [
  { practitionerId: "practitioner-a", displayName: "Synthetic Practice A" },
  { practitionerId: "practitioner-b", displayName: "Synthetic Practice B" },
  { practitionerId: "practitioner-c", displayName: "Synthetic Practice C" },
];

const confirmation = {
  kind: "confirmed" as const,
  confirmationId: "confirmation-001",
  slot: {
    startsAt: "2026-12-01T10:00:00+01:00",
    endsAt: "2026-12-01T10:30:00+01:00",
  },
};

function callerFrom(
  callPractice: PracticeCaller["callPractice"],
): PracticeCaller {
  return { callPractice };
}

function callerReturningUnknown(response: unknown): PracticeCaller {
  const caller = callerFrom(async () => ({ kind: "refused" }));
  Object.defineProperty(caller, "callPractice", {
    value: async () => response,
  });
  return caller;
}

describe("bookAppointment", () => {
  it("returns the first explicit confirmation and stops immediately", async () => {
    const callPractice = vi.fn().mockResolvedValue(confirmation);

    const result = await bookAppointment(request, candidates, callerFrom(callPractice));

    expect(result).toMatchObject({
      kind: "confirmed",
      practitioner: candidates[0],
      confirmationId: "confirmation-001",
      attempts: [{ kind: "confirmed", practitioner: candidates[0] }],
    });
    expect(callPractice).toHaveBeenCalledTimes(1);
  });

  it("tries the second practitioner when the first refuses", async () => {
    const callPractice = vi
      .fn()
      .mockResolvedValueOnce({ kind: "refused" })
      .mockResolvedValueOnce(confirmation);

    const result = await bookAppointment(request, candidates, callerFrom(callPractice));

    expect(result).toMatchObject({
      kind: "confirmed",
      practitioner: candidates[1],
      attempts: [{ kind: "refused" }, { kind: "confirmed" }],
    });
    expect(callPractice).toHaveBeenCalledTimes(2);
  });

  it("returns not-confirmed when both practitioners refuse", async () => {
    const callPractice = vi.fn().mockResolvedValue({ kind: "refused" });

    const result = await bookAppointment(request, candidates, callerFrom(callPractice));

    expect(result).toEqual({
      kind: "not-confirmed",
      requestId: "request-001",
      reason: "attempts-exhausted",
      attempts: [
        { kind: "refused", practitioner: candidates[0] },
        { kind: "refused", practitioner: candidates[1] },
      ],
    });
  });

  it.each([0, 1])(
    "continues after practitioner %i is unavailable",
    async (unavailableIndex) => {
      const callPractice = vi.fn().mockImplementation(async ({ practitioner }) => {
        const index = candidates.findIndex(
          (candidate) => candidate.practitionerId === practitioner.practitionerId,
        );
        return index === unavailableIndex ? { kind: "unavailable" } : { kind: "refused" };
      });

      const result = await bookAppointment(request, candidates, callerFrom(callPractice));

      expect(result.kind).toBe("not-confirmed");
      expect(callPractice).toHaveBeenCalledTimes(2);
      if (result.kind === "not-confirmed") {
        expect(result.attempts[unavailableIndex]?.kind).toBe("unavailable");
      }
    },
  );

  it("never calls a third practitioner", async () => {
    const callPractice = vi.fn().mockResolvedValue({ kind: "refused" });

    await bookAppointment(request, candidates, callerFrom(callPractice));

    expect(callPractice).toHaveBeenCalledTimes(2);
    expect(callPractice).not.toHaveBeenCalledWith(
      expect.objectContaining({ practitioner: candidates[2] }),
    );
  });

  it("contains adapter exceptions without exposing their details", async () => {
    const callPractice = vi
      .fn()
      .mockRejectedValueOnce(new Error("private adapter detail"))
      .mockResolvedValueOnce({ kind: "refused" });

    const result = await bookAppointment(request, candidates, callerFrom(callPractice));

    expect(result).toEqual({
      kind: "not-confirmed",
      requestId: "request-001",
      reason: "attempts-exhausted",
      attempts: [
        { kind: "caller-error", practitioner: candidates[0] },
        { kind: "refused", practitioner: candidates[1] },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("private adapter detail");
  });

  it.each([
    undefined,
    true,
    {},
    { kind: "maybe" },
    { kind: "confirmed" },
    { kind: "confirmed", confirmationId: "", slot: confirmation.slot },
  ])("rejects an invalid or ambiguous adapter response: %j", async (response) => {
    const result = await bookAppointment(
      request,
      candidates.slice(0, 1),
      callerReturningUnknown(response),
    );

    expect(result).toMatchObject({
      kind: "not-confirmed",
      attempts: [{ kind: "invalid-response" }],
    });
  });

  it.each([
    { startsAt: "not-a-date", endsAt: "2026-12-01T10:30:00+01:00" },
    { startsAt: "2026-12-01T10:00:00+01:00", endsAt: "not-a-date" },
    {
      startsAt: "2026-12-01T10:30:00+01:00",
      endsAt: "2026-12-01T10:00:00+01:00",
    },
    { startsAt: "2026-12-01T10:00:00", endsAt: "2026-12-01T10:30:00" },
  ])("rejects a confirmation without a valid slot: %j", async (slot) => {
    const result = await bookAppointment(
      request,
      candidates.slice(0, 1),
      callerReturningUnknown({
        kind: "confirmed",
        confirmationId: "confirmation-001",
        slot,
      }),
    );

    expect(result).toMatchObject({
      kind: "not-confirmed",
      attempts: [{ kind: "invalid-response" }],
    });
  });

  it("returns an explicit result when no practitioner is provided", async () => {
    const callPractice = vi.fn();

    const result = await bookAppointment(request, [], callerFrom(callPractice));

    expect(result).toEqual({
      kind: "not-confirmed",
      requestId: "request-001",
      reason: "no-candidates",
      attempts: [],
    });
    expect(callPractice).not.toHaveBeenCalled();
  });

  it("preserves candidate order", async () => {
    const callPractice = vi.fn().mockResolvedValue({ kind: "refused" });

    await bookAppointment(request, candidates, callerFrom(callPractice));

    expect(callPractice.mock.calls.map(([input]) => input.practitioner.practitionerId)).toEqual([
      "practitioner-a",
      "practitioner-b",
    ]);
  });

  it("does not mutate inputs and isolates them from adapter mutations", async () => {
    const mutableRequest = structuredClone(request);
    const mutableCandidates = structuredClone(candidates);
    const originalRequest = structuredClone(mutableRequest);
    const originalCandidates = structuredClone(mutableCandidates);
    const callPractice = vi.fn().mockImplementation(async (input) => {
      Reflect.set(input.request, "requestId", "mutated");
      Reflect.set(input.request.requestedWindow, "startsAt", "mutated");
      Reflect.set(input.practitioner, "displayName", "mutated");
      return { kind: "refused" };
    });

    const result = await bookAppointment(
      mutableRequest,
      mutableCandidates,
      callerFrom(callPractice),
    );

    expect(mutableRequest).toEqual(originalRequest);
    expect(mutableCandidates).toEqual(originalCandidates);
    expect(result.requestId).toBe("request-001");
    expect(result.attempts.map((attempt) => attempt.practitioner.displayName)).toEqual([
      "Synthetic Practice A",
      "Synthetic Practice B",
    ]);
  });

  it("copies adapter results before returning them", async () => {
    const mutableConfirmation = structuredClone(confirmation);
    const result = await bookAppointment(
      request,
      candidates,
      callerFrom(async () => mutableConfirmation),
    );

    mutableConfirmation.confirmationId = "mutated";
    mutableConfirmation.slot.startsAt = "mutated";

    expect(result).toMatchObject({
      kind: "confirmed",
      confirmationId: "confirmation-001",
      slot: { startsAt: "2026-12-01T10:00:00+01:00" },
    });
  });

  it("validates request and candidate values before calling the adapter", async () => {
    const callPractice = vi.fn();

    await expect(
      bookAppointment(
        { ...request, requestId: " " },
        candidates,
        callerFrom(callPractice),
      ),
    ).rejects.toThrow("Invalid appointment request");
    await expect(
      bookAppointment(
        request,
        [{ practitionerId: "", displayName: "Synthetic Practice" }],
        callerFrom(callPractice),
      ),
    ).rejects.toThrow("Invalid practitioner candidate");
    expect(callPractice).not.toHaveBeenCalled();
  });
});
