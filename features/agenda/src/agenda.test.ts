import { describe, expect, it } from "vitest";

import {
  agendaLimits,
  createAgenda,
  InMemoryAppointmentStorage,
  type AgendaResult,
  type AppointmentInput,
  type AppointmentStorage,
  type ConfirmedAppointment,
} from "./index.ts";

const appointment = (id = "appointment-1"): AppointmentInput => ({
  id,
  confirmation: { status: "confirmed", reference: `confirmation-${id}` },
  practitioner: { name: "Dr Synthetic" },
  startsAt: "2026-12-01T14:00:00+01:00",
  endsAt: "2026-12-01T14:30:00+01:00",
  location: { kind: "physical", address: "1 Test Street, Paris" },
});

const makeAgenda = (maximumAppointments?: number) => {
  const storage = new InMemoryAppointmentStorage();
  return {
    storage,
    agenda: createAgenda({
      storage,
      ...(maximumAppointments === undefined ? {} : { maximumAppointments }),
    }),
  };
};

const expectErrorKind = <Value>(
  result: AgendaResult<Value>,
  kind: string,
): void => {
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.error.kind).toBe(kind);
  }
};

describe("agenda registration", () => {
  it("registers a valid confirmed appointment", () => {
    const { agenda } = makeAgenda();

    expect(agenda.register(appointment())).toEqual({
      status: "success",
      value: appointment(),
    });
  });

  it.each(["provisional", "refused", "ambiguous"] as const)(
    "rejects a %s appointment",
    (confirmationStatus) => {
      const { agenda } = makeAgenda();
      const input = appointment();
      input.confirmation.status = confirmationStatus;

      expectErrorKind(agenda.register(input), "not-confirmed");
    },
  );

  it("rejects an empty confirmation reference", () => {
    const { agenda } = makeAgenda();
    const input = appointment();
    input.confirmation.reference = "   ";

    expect(agenda.register(input)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "confirmation.reference",
        reason: "required",
      },
    });
  });

  it("rejects an invalid identifier", () => {
    const { agenda } = makeAgenda();

    expect(agenda.register(appointment("invalid id"))).toEqual({
      status: "error",
      error: { kind: "validation", field: "id", reason: "invalid-format" },
    });
  });

  it("rejects a date without an explicit time zone", () => {
    const { agenda } = makeAgenda();
    const input = appointment();
    input.startsAt = "2026-12-01T14:00:00";

    expect(agenda.register(input)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "startsAt",
        reason: "invalid-format",
      },
    });
  });

  it("rejects an impossible calendar date and an oversized timestamp", () => {
    const { agenda } = makeAgenda();
    const impossibleDate = appointment();
    impossibleDate.startsAt = "2026-02-30T14:00:00Z";
    const oversizedDate = appointment("appointment-2");
    oversizedDate.startsAt = `2026-12-01T14:00:00.${"1".repeat(30)}Z`;

    expect(agenda.register(impossibleDate)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "startsAt",
        reason: "invalid-format",
      },
    });
    expect(agenda.register(oversizedDate)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "startsAt",
        reason: "too-long",
      },
    });
  });

  it.each([
    "2026-12-01T14:00:00+01:00",
    "2026-12-01T13:59:59+01:00",
  ])("rejects an end that is not after the start", (endsAt) => {
    const { agenda } = makeAgenda();
    const input = appointment();
    input.endsAt = endsAt;

    expect(agenda.register(input)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "endsAt",
        reason: "invalid-range",
      },
    });
  });

  it("rejects empty and oversized fields", () => {
    const { agenda } = makeAgenda();
    const emptyName = appointment();
    emptyName.practitioner.name = "";
    const emptyLocation = appointment("appointment-2");
    if (emptyLocation.location.kind === "physical") {
      emptyLocation.location.address = "  ";
    }
    const longLocation = appointment("appointment-3");
    if (longLocation.location.kind === "physical") {
      longLocation.location.address = "x".repeat(
        agendaLimits.locationLength + 1,
      );
    }

    expect(agenda.register(emptyName)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "practitioner.name",
        reason: "required",
      },
    });
    expect(agenda.register(emptyLocation)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "location.address",
        reason: "required",
      },
    });
    expect(agenda.register(longLocation)).toEqual({
      status: "error",
      error: {
        kind: "validation",
        field: "location.address",
        reason: "too-long",
      },
    });
  });

  it("rejects an oversized identifier", () => {
    const { agenda } = makeAgenda();

    expect(
      agenda.register(
        appointment("x".repeat(agendaLimits.appointmentIdLength + 1)),
      ),
    ).toEqual({
      status: "error",
      error: { kind: "validation", field: "id", reason: "too-long" },
    });
  });

  it("does not silently replace an existing identifier", () => {
    const { agenda } = makeAgenda();
    const replacement = appointment();
    replacement.practitioner.name = "Dr Replacement";

    expect(agenda.register(appointment()).status).toBe("success");
    expect(agenda.register(replacement)).toEqual({
      status: "error",
      error: { kind: "already-exists", id: "appointment-1" },
    });
    expect(agenda.get("appointment-1")).toEqual({
      status: "success",
      value: appointment(),
    });
  });

  it("enforces the configured agenda capacity", () => {
    const { agenda } = makeAgenda(1);

    expect(agenda.register(appointment()).status).toBe("success");
    expect(agenda.register(appointment("appointment-2"))).toEqual({
      status: "error",
      error: { kind: "capacity-reached", limit: 1 },
    });
  });
});

describe("agenda reads and removal", () => {
  it("gets an appointment by identifier and reports a missing one", () => {
    const { agenda } = makeAgenda();
    agenda.register(appointment());

    expect(agenda.get("appointment-1")).toEqual({
      status: "success",
      value: appointment(),
    });
    expect(agenda.get("missing")).toEqual({
      status: "error",
      error: { kind: "not-found", id: "missing" },
    });
  });

  it("lists by start time and then by identifier", () => {
    const { agenda } = makeAgenda();
    const later = appointment("later");
    later.startsAt = "2026-12-02T10:00:00Z";
    later.endsAt = "2026-12-02T10:30:00Z";
    const sameTimeB = appointment("b");
    const sameTimeA = appointment("a");
    agenda.register(later);
    agenda.register(sameTimeB);
    agenda.register(sameTimeA);

    const result = agenda.list();
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.value.map(({ id }) => id)).toEqual(["a", "b", "later"]);
    }
  });

  it("removes an appointment and reports a missing one", () => {
    const { agenda } = makeAgenda();
    agenda.register(appointment());

    expect(agenda.remove("appointment-1")).toEqual({
      status: "success",
      value: appointment(),
    });
    expect(agenda.remove("appointment-1")).toEqual({
      status: "error",
      error: { kind: "not-found", id: "appointment-1" },
    });
  });

  it("converts storage exceptions into generic errors", () => {
    const brokenStorage: AppointmentStorage = {
      list: () => {
        throw new Error("private storage detail");
      },
      get: () => {
        throw new Error("private storage detail");
      },
      create: () => {
        throw new Error("private storage detail");
      },
      delete: () => {
        throw new Error("private storage detail");
      },
    };
    const agenda = createAgenda({ storage: brokenStorage });

    expect(agenda.register(appointment())).toEqual({
      status: "error",
      error: { kind: "storage-error" },
    });
    expect(agenda.get("appointment-1")).toEqual({
      status: "error",
      error: { kind: "storage-error" },
    });
    expect(agenda.list()).toEqual({
      status: "error",
      error: { kind: "storage-error" },
    });
    expect(agenda.remove("appointment-1")).toEqual({
      status: "error",
      error: { kind: "storage-error" },
    });
  });

  it("copies values defensively on write and read", () => {
    const { agenda } = makeAgenda();
    const input = appointment();
    agenda.register(input);
    input.practitioner.name = "Mutated input";

    const firstRead = agenda.get("appointment-1");
    if (firstRead.status === "success") {
      firstRead.value.practitioner.name = "Mutated output";
    }

    expect(agenda.get("appointment-1")).toEqual({
      status: "success",
      value: appointment(),
    });
  });
});

describe("in-memory storage", () => {
  it("copies values at its own boundary", () => {
    const storage = new InMemoryAppointmentStorage();
    const stored: ConfirmedAppointment = {
      ...appointment(),
      confirmation: { status: "confirmed", reference: "confirmation" },
    };
    storage.create(stored);
    stored.practitioner.name = "Changed after create";
    const read = storage.get("appointment-1");
    if (read !== undefined) {
      read.practitioner.name = "Changed after get";
    }

    expect(storage.get("appointment-1")?.practitioner.name).toBe(
      "Dr Synthetic",
    );
  });
});
