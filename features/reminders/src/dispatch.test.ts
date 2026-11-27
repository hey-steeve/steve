import { describe, expect, test, vi } from "vitest";
import {
  InMemoryReminderStorage,
  createReminderService,
  type AgendaAppointment,
  type AgendaSource,
  type ReminderSender,
  type ScheduleReminderInput,
} from "./index.ts";

const appointment: AgendaAppointment = {
  id: "apt_dispatch",
  startAt: "2026-11-27T10:00:00.000Z",
  title: "Synthetic consultation",
  location: "Synthetic clinic",
};

function scheduleInput(
  overrides: Partial<ScheduleReminderInput> = {},
): ScheduleReminderInput {
  return {
    appointmentId: appointment.id,
    remindAt: "2026-11-26T10:00:00.000Z",
    channel: "sms",
    details: { type: "appointment" },
    ...overrides,
  };
}

function harness(options: {
  readonly sender?: ReminderSender;
  readonly appointmentValue?: AgendaAppointment | null;
} = {}) {
  let now = new Date("2026-11-26T09:00:00.000Z");
  let appointmentValue = options.appointmentValue === undefined
    ? appointment
    : options.appointmentValue;
  let nextId = 0;
  const agendaSource: AgendaSource = {
    getAppointment: vi.fn(async () => appointmentValue),
  };
  const sender = options.sender ?? {
    send: vi.fn(async () => ({ ok: true })),
  };
  const service = createReminderService({
    agendaSource,
    sender,
    storage: new InMemoryReminderStorage(),
    now: () => new Date(now),
    generateId: () => `rem_${String(nextId += 1).padStart(2, "0")}`,
  });
  return {
    agendaSource,
    sender,
    service,
    setAppointment(value: AgendaAppointment | null) {
      appointmentValue = value;
    },
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

describe("deterministic reminder dispatch", () => {
  test("sends a due SMS after revalidating the Agenda appointment", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.000Z");

    const report = await context.service.dispatchDue();

    expect(report).toEqual({
      ok: true,
      value: {
        dispatchedAt: "2026-11-26T10:00:00.000Z",
        outcomes: [{ reminderId: "rem_01", outcome: "sent" }],
      },
    });
    expect(context.sender.send).toHaveBeenCalledWith({
      reminderId: "rem_01",
      appointmentId: "apt_dispatch",
      channel: "sms",
      body: "Appointment reminder: 2026-11-27T10:00:00.000Z. Synthetic consultation. Location: Synthetic clinic.",
    });
    expect(context.agendaSource.getAppointment).toHaveBeenCalledTimes(2);
  });

  test("sends a due call through the injected sender", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput({ channel: "call" }));
    context.setNow("2026-11-26T10:01:00.000Z");

    await context.service.dispatchDue();

    expect(context.sender.send).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "call" }),
    );
  });

  test("does not send before the due time", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput());

    const report = await context.service.dispatchDue();

    expect(report).toEqual({
      ok: true,
      value: { dispatchedAt: "2026-11-26T09:00:00.000Z", outcomes: [] },
    });
    expect(context.sender.send).not.toHaveBeenCalled();
  });

  test("dispatches multiple due reminders by time and then identifier", async () => {
    const context = harness();
    await context.service.schedule(
      scheduleInput({
        remindAt: "2026-11-26T10:30:00.000Z",
        channel: "call",
      }),
    );
    await context.service.schedule(scheduleInput({ channel: "call" }));
    await context.service.schedule(scheduleInput({ channel: "sms" }));
    context.setNow("2026-11-26T11:00:00.000Z");

    const report = await context.service.dispatchDue();

    expect(report).toMatchObject({
      ok: true,
      value: {
        outcomes: [
          { reminderId: "rem_02", outcome: "sent" },
          { reminderId: "rem_03", outcome: "sent" },
          { reminderId: "rem_01", outcome: "sent" },
        ],
      },
    });
    expect(vi.mocked(context.sender.send).mock.calls.map(([message]) =>
      message.reminderId
    )).toEqual(["rem_02", "rem_03", "rem_01"]);
  });

  test("does not send an already sent reminder twice", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.000Z");
    await context.service.dispatchDue();

    const second = await context.service.dispatchDue();

    expect(second).toMatchObject({ ok: true, value: { outcomes: [] } });
    expect(context.sender.send).toHaveBeenCalledTimes(1);
  });

  test("does not send a cancelled reminder", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput());
    await context.service.cancel("rem_01");
    context.setNow("2026-11-26T10:00:00.000Z");

    const report = await context.service.dispatchDue();

    expect(report).toMatchObject({ ok: true, value: { outcomes: [] } });
    expect(context.sender.send).not.toHaveBeenCalled();
  });

  test("cancels without sending when the appointment was deleted", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput());
    context.setAppointment(null);
    context.setNow("2026-11-26T10:00:00.000Z");

    const report = await context.service.dispatchDue();
    const listed = await context.service.list();

    expect(report).toEqual({
      ok: true,
      value: {
        dispatchedAt: "2026-11-26T10:00:00.000Z",
        outcomes: [
          {
            reminderId: "rem_01",
            outcome: "cancelled",
            reason: "appointment-missing",
          },
        ],
      },
    });
    expect(listed).toMatchObject({
      ok: true,
      value: [
        {
          status: "cancelled",
          cancellationReason: "appointment-missing",
        },
      ],
    });
    expect(context.sender.send).not.toHaveBeenCalled();
  });

  test("turns sender exceptions into a generic failed state without leaking content", async () => {
    const sender: ReminderSender = {
      send: vi.fn(async () => {
        throw new Error("private provider detail");
      }),
    };
    const context = harness({ sender });
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.000Z");

    const report = await context.service.dispatchDue();
    const listed = await context.service.list();

    expect(report).toEqual({
      ok: true,
      value: {
        dispatchedAt: "2026-11-26T10:00:00.000Z",
        outcomes: [
          {
            reminderId: "rem_01",
            outcome: "failed",
            reason: "delivery-failed",
          },
        ],
      },
    });
    expect(listed).toMatchObject({
      ok: true,
      value: [
        {
          status: "failed",
          attemptCount: 1,
          failureReason: "delivery-failed",
        },
      ],
    });
    expect(JSON.stringify({ report, listed })).not.toContain(
      "private provider detail",
    );
  });

  test.each([
    ["null", null],
    ["ambiguous success", { ok: true, error: "ambiguous" }],
    ["unknown ok value", { ok: "yes" }],
    ["explicit rejection", { ok: false }],
  ])("rejects the sender response %s", async (_label, response) => {
    const context = harness({
      sender: { send: vi.fn(async () => response) },
    });
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.000Z");

    const report = await context.service.dispatchDue();

    expect(report).toMatchObject({
      ok: true,
      value: {
        outcomes: [
          { outcome: "failed", reason: "delivery-failed" },
        ],
      },
    });
  });

  test("retries a failed reminder only on the next explicit dispatch call", async () => {
    const sender: ReminderSender = {
      send: vi
        .fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true }),
    };
    const context = harness({ sender });
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.000Z");
    await context.service.dispatchDue();

    const retry = await context.service.dispatchDue();
    const listed = await context.service.list();

    expect(retry).toMatchObject({
      ok: true,
      value: { outcomes: [{ reminderId: "rem_01", outcome: "sent" }] },
    });
    expect(listed).toMatchObject({
      ok: true,
      value: [{ status: "sent", attemptCount: 2 }],
    });
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  test("gives the sender a defensive message copy on every attempt", async () => {
    const bodies: string[] = [];
    const sender: ReminderSender = {
      send: vi.fn(async (message) => {
        bodies.push(message.body);
        Reflect.set(message, "body", "Mutated by sender");
        return bodies.length === 1 ? { ok: false } : { ok: true };
      }),
    };
    const context = harness({ sender });
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.000Z");

    await context.service.dispatchDue();
    await context.service.dispatchDue();

    expect(bodies).toEqual([
      "Appointment reminder: 2026-11-27T10:00:00.000Z. Synthetic consultation. Location: Synthetic clinic.",
      "Appointment reminder: 2026-11-27T10:00:00.000Z. Synthetic consultation. Location: Synthetic clinic.",
    ]);
  });

  test("copies only the declared medication instruction into the message", async () => {
    const context = harness();
    await context.service.schedule(
      scheduleInput({
        details: {
          type: "medication",
          instruction: "Take the declared tablet with water.",
        },
      }),
    );
    context.setNow("2026-11-26T10:00:00.000Z");

    await context.service.dispatchDue();

    expect(context.sender.send).toHaveBeenCalledWith({
      reminderId: "rem_01",
      appointmentId: "apt_dispatch",
      channel: "sms",
      body: "Medication reminder: Take the declared tablet with water.",
    });
  });

  test("uses the injected clock deterministically", async () => {
    const context = harness();
    await context.service.schedule(scheduleInput());
    context.setNow("2026-11-26T10:00:00.123Z");

    const report = await context.service.dispatchDue();
    const listed = await context.service.list();

    expect(report).toMatchObject({
      ok: true,
      value: { dispatchedAt: "2026-11-26T10:00:00.123Z" },
    });
    expect(listed).toMatchObject({
      ok: true,
      value: [{ status: "sent", sentAt: "2026-11-26T10:00:00.123Z" }],
    });
  });
});
