import { describe, expect, it } from "vitest";

import {
  createAgenda,
  InMemoryAppointmentStorage,
  type AppointmentInput,
  type AppointmentStorage,
  type CalendarGateway,
  type CalendarGatewayRequest,
  type CalendarGatewayResponse,
} from "./index.ts";

const input = (
  location: AppointmentInput["location"] = {
    kind: "physical",
    address: "10 Synthetic Avenue, Paris",
  },
): AppointmentInput => ({
  id: "appointment-sync-1",
  confirmation: { status: "confirmed", reference: "confirmation-sync-1" },
  practitioner: { name: "Dr Test" },
  startsAt: "2026-12-10T09:00:00+01:00",
  endsAt: "2026-12-10T09:30:00+01:00",
  location,
});

const clock = { now: () => new Date("2026-11-27T08:00:00Z") };

const setup = (
  response: unknown = {
    status: "synced",
    externalEventId: "external-event-1",
    syncedAt: "2026-11-27T08:01:00Z",
  },
) => {
  const requests: CalendarGatewayRequest[] = [];
  const gateway: CalendarGateway = {
    upsert: (request) => {
      requests.push(request);
      return Promise.resolve(response);
    },
  };
  const storage = new InMemoryAppointmentStorage();
  const agenda = createAgenda({ storage, clock, calendarGateway: gateway });
  return { agenda, gateway, requests, storage };
};

describe("calendar synchronization", () => {
  it.each([
    { kind: "physical", address: "10 Synthetic Avenue, Paris" } as const,
    { kind: "remote", label: "Synthetic video room" } as const,
    { kind: "remote" } as const,
  ])("sends a defensive confirmed appointment for $kind locations", async (location) => {
    const { agenda, requests } = setup();
    const appointment = input(location);
    agenda.register(appointment);

    await expect(agenda.syncCalendar(appointment.id)).resolves.toEqual({
      status: "success",
      value: {
        status: "synced",
        externalEventId: "external-event-1",
        syncedAt: "2026-11-27T08:01:00Z",
      },
    });
    expect(requests).toEqual([
      { idempotencyKey: appointment.id, appointment },
    ]);
    const received = requests[0];
    if (received !== undefined) {
      received.appointment.practitioner.name = "Mutated by gateway";
    }
    expect(agenda.get(appointment.id)).toEqual({
      status: "success",
      value: appointment,
    });
  });

  it("does not call the gateway for missing or invalid identifiers", async () => {
    const { agenda, requests } = setup();

    await expect(agenda.syncCalendar("missing")).resolves.toEqual({
      status: "error",
      error: { kind: "not-found", id: "missing" },
    });
    await expect(agenda.syncCalendar("invalid id")).resolves.toEqual({
      status: "error",
      error: { kind: "invalid-id" },
    });
    expect(requests).toEqual([]);
  });

  it("reports an unconfigured gateway without changing existing methods", async () => {
    const storage = new InMemoryAppointmentStorage();
    const agenda = createAgenda({ storage, clock });
    const appointment = input();
    expect(agenda.register(appointment).status).toBe("success");
    expect(agenda.get(appointment.id).status).toBe("success");
    expect(agenda.list().status).toBe("success");
    expect(agenda.exportIcs(appointment.id).status).toBe("success");
    await expect(agenda.syncCalendar(appointment.id)).resolves.toEqual({
      status: "error",
      error: { kind: "not-configured" },
    });
    expect(agenda.remove(appointment.id).status).toBe("success");
  });

  it("maps rejection and gateway exceptions to stable errors", async () => {
    const rejected = setup({ status: "rejected" });
    rejected.agenda.register(input());
    await expect(rejected.agenda.syncCalendar(input().id)).resolves.toEqual({
      status: "error",
      error: { kind: "rejected" },
    });

    const failure = setup();
    failure.agenda.register(input());
    failure.gateway.upsert = () =>
      Promise.reject(new Error("private provider detail"));
    await expect(failure.agenda.syncCalendar(input().id)).resolves.toEqual({
      status: "error",
      error: { kind: "gateway-error" },
    });
  });

  it.each([
    null,
    { status: "unknown" },
    { status: "rejected", extra: true },
    { status: "synced", externalEventId: "", syncedAt: "2026-11-27T08:01:00Z" },
    { status: "synced", externalEventId: "x".repeat(257), syncedAt: "2026-11-27T08:01:00Z" },
    { status: "synced", externalEventId: "event", syncedAt: "2026-11-27T08:01:00" },
    { status: "synced", externalEventId: "event", syncedAt: "2026-02-30T08:01:00Z" },
    { status: "synced", externalEventId: "event", syncedAt: "2026-11-27T08:01:00Z", extra: true },
    { status: "synced", externalEventId: "event" },
  ])("rejects an untrusted invalid gateway response", async (response) => {
    const { agenda } = setup(response);
    agenda.register(input());

    await expect(agenda.syncCalendar(input().id)).resolves.toEqual({
      status: "error",
      error: { kind: "invalid-response" },
    });
  });

  it("keeps storage failures generic", async () => {
    const storage: AppointmentStorage = {
      list: () => [],
      get: () => {
        throw new Error("private storage detail");
      },
      create: () => ({ status: "created" }),
      delete: () => ({ status: "not-found" }),
    };
    const gateway: CalendarGateway = {
      upsert: () => Promise.resolve({ status: "rejected" }),
    };
    const agenda = createAgenda({ storage, clock, calendarGateway: gateway });

    await expect(agenda.syncCalendar(input().id)).resolves.toEqual({
      status: "error",
      error: { kind: "storage-error" },
    });
  });

  it("returns a public result independent from future gateway responses", async () => {
    const response: CalendarGatewayResponse = {
      status: "synced",
      externalEventId: "external-event-1",
      syncedAt: "2026-11-27T08:01:00Z",
    };
    const { agenda } = setup(response);
    agenda.register(input());
    const result = await agenda.syncCalendar(input().id);
    if (result.status === "success") {
      Reflect.set(result.value, "externalEventId", "mutated result");
    }

    await expect(agenda.syncCalendar(input().id)).resolves.toEqual({
      status: "success",
      value: response,
    });
  });
});
