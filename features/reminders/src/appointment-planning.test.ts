import { describe, expect, test, vi } from "vitest";
import {
  createReminderService,
  reminderLimits,
  type AgendaAppointment,
  type AppointmentReminderPlanRule,
  type PlanAppointmentRemindersInput,
  type ReminderSender,
  type ReminderStorage,
  type ScheduleReminderInput,
} from "./index.ts";

const appointment: AgendaAppointment = {
  id: "apt_planning",
  startAt: "2026-11-28T10:00:00+01:00",
  title: "Synthetic appointment",
};

function input(
  rules: readonly AppointmentReminderPlanRule[] = [
    { minutesBefore: 60, channel: "sms" },
  ],
): PlanAppointmentRemindersInput {
  return { appointmentId: appointment.id, rules };
}

function harness(options: {
  readonly appointment?: AgendaAppointment | null;
  readonly agendaError?: Error;
  readonly now?: () => Date;
} = {}) {
  const agendaSource = {
    getAppointment: vi.fn(async () => {
      if (options.agendaError !== undefined) {
        throw options.agendaError;
      }
      return options.appointment === undefined
        ? appointment
        : options.appointment;
    }),
  };
  const sender: ReminderSender = {
    send: vi.fn(async () => ({ ok: true })),
  };
  const storage: ReminderStorage = {
    create: vi.fn(async () => "created" as const),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    replace: vi.fn(async () => "updated" as const),
  };
  const generateId = vi.fn(() => "rem_unused");
  const clock = vi.fn(
    options.now ?? (() => new Date("2026-11-27T09:00:00.000Z")),
  );
  const service = createReminderService({
    agendaSource,
    sender,
    storage,
    now: clock,
    generateId,
  });
  return { agendaSource, clock, generateId, sender, service, storage };
}

describe("appointment reminder planning", () => {
  test("plans one valid SMS reminder", async () => {
    const context = harness();

    const result = await context.service.planAppointmentReminders(input());

    expect(result).toEqual({
      ok: true,
      value: {
        appointmentId: "apt_planning",
        appointmentStartAt: "2026-11-28T09:00:00.000Z",
        planned: [
          {
            appointmentId: "apt_planning",
            remindAt: "2026-11-28T08:00:00.000Z",
            channel: "sms",
            details: { type: "appointment" },
          },
        ],
        skipped: [],
      },
    });
  });

  test("plans one valid call reminder", async () => {
    const context = harness();

    const result = await context.service.planAppointmentReminders(
      input([{ minutesBefore: 120, channel: "call" }]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        planned: [
          { remindAt: "2026-11-28T07:00:00.000Z", channel: "call" },
        ],
      },
    });
  });

  test("plans and orders multiple rules by time then channel", async () => {
    const context = harness();

    const result = await context.service.planAppointmentReminders(
      input([
        { minutesBefore: 60, channel: "sms" },
        { minutesBefore: 120, channel: "sms" },
        { minutesBefore: 120, channel: "call" },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        planned: [
          { remindAt: "2026-11-28T07:00:00.000Z", channel: "call" },
          { remindAt: "2026-11-28T07:00:00.000Z", channel: "sms" },
          { remindAt: "2026-11-28T08:00:00.000Z", channel: "sms" },
        ],
      },
    });
  });

  test("calculates from the instant represented by an explicit offset", async () => {
    const context = harness({
      appointment: {
        id: appointment.id,
        startAt: "2026-11-28T10:00:00-05:00",
      },
    });

    const result = await context.service.planAppointmentReminders(
      input([{ minutesBefore: 60, channel: "sms" }]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        appointmentStartAt: "2026-11-28T15:00:00.000Z",
        planned: [{ remindAt: "2026-11-28T14:00:00.000Z" }],
      },
    });
  });

  test("subtracts elapsed minutes across a DST offset change", async () => {
    const context = harness({
      appointment: {
        id: appointment.id,
        startAt: "2027-03-28T03:30:00+02:00",
      },
      now: () => new Date("2027-03-27T20:00:00.000Z"),
    });

    const result = await context.service.planAppointmentReminders(
      input([{ minutesBefore: 120, channel: "call" }]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        appointmentStartAt: "2027-03-28T01:30:00.000Z",
        planned: [{ remindAt: "2027-03-27T23:30:00.000Z" }],
      },
    });
  });

  test("skips a rule calculated exactly at now", async () => {
    const context = harness({
      appointment: { id: appointment.id, startAt: "2026-11-27T10:00:00Z" },
    });

    const result = await context.service.planAppointmentReminders(
      input([{ minutesBefore: 60, channel: "sms" }]),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        appointmentId: appointment.id,
        appointmentStartAt: "2026-11-27T10:00:00.000Z",
        planned: [],
        skipped: [
          {
            rule: { minutesBefore: 60, channel: "sms" },
            reason: "not-in-future",
          },
        ],
      },
    });
  });

  test("skips a rule calculated before now", async () => {
    const context = harness({
      appointment: { id: appointment.id, startAt: "2026-11-27T09:30:00Z" },
    });

    const result = await context.service.planAppointmentReminders(
      input([{ minutesBefore: 60, channel: "call" }]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        planned: [],
        skipped: [{ rule: { channel: "call" }, reason: "not-in-future" }],
      },
    });
  });

  test("returns planned and skipped rules without hiding late rules", async () => {
    const context = harness({
      appointment: { id: appointment.id, startAt: "2026-11-27T11:00:00Z" },
    });

    const result = await context.service.planAppointmentReminders(
      input([
        { minutesBefore: 120, channel: "sms" },
        { minutesBefore: 30, channel: "call" },
        { minutesBefore: 180, channel: "call" },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        planned: [{ channel: "call", remindAt: "2026-11-27T10:30:00.000Z" }],
        skipped: [
          { rule: { minutesBefore: 120, channel: "sms" } },
          { rule: { minutesBefore: 180, channel: "call" } },
        ],
      },
    });
  });

  test("returns all rules as skipped in their input order", async () => {
    const context = harness({
      appointment: { id: appointment.id, startAt: "2026-11-27T10:00:00Z" },
    });
    const rules: readonly AppointmentReminderPlanRule[] = [
      { minutesBefore: 60, channel: "sms" },
      { minutesBefore: 120, channel: "call" },
    ];

    const result = await context.service.planAppointmentReminders(input(rules));

    expect(result).toMatchObject({
      ok: true,
      value: { planned: [], skipped: rules.map((rule) => ({ rule })) },
    });
  });

  test("returns appointment not found", async () => {
    const context = harness({ appointment: null });

    const result = await context.service.planAppointmentReminders(input());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "APPOINTMENT_NOT_FOUND",
        message: "Appointment was not found in Agenda.",
      },
    });
  });

  test("contains Agenda exceptions", async () => {
    const context = harness({ agendaError: new Error("private agenda detail") });

    const result = await context.service.planAppointmentReminders(input());

    expect(result).toEqual({
      ok: false,
      error: { code: "AGENDA_FAILURE", message: "Agenda lookup failed." },
    });
    expect(JSON.stringify(result)).not.toContain("private agenda detail");
  });

  test("rejects an invalid Agenda timestamp", async () => {
    const context = harness({
      appointment: { id: appointment.id, startAt: "not-a-timestamp" },
    });

    const result = await context.service.planAppointmentReminders(input());

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AGENDA_FAILURE",
        message: "Agenda returned invalid appointment data.",
      },
    });
  });

  test("contains invalid and throwing clocks", async () => {
    const invalidClock = harness({ now: () => new Date(Number.NaN) });
    const throwingClock = harness({
      now: () => {
        throw new Error("private clock detail");
      },
    });

    const invalid = await invalidClock.service.planAppointmentReminders(input());
    const throwing = await throwingClock.service.planAppointmentReminders(input());

    expect(invalid).toEqual({
      ok: false,
      error: { code: "CLOCK_FAILURE", message: "Reminder clock failed." },
    });
    expect(throwing).toEqual(invalid);
    expect(JSON.stringify(throwing)).not.toContain("private clock detail");
  });

  test.each<[string, readonly AppointmentReminderPlanRule[]]>([
    ["zero", [{ minutesBefore: 0, channel: "sms" }]],
    ["negative", [{ minutesBefore: -1, channel: "sms" }]],
    ["fractional", [{ minutesBefore: 1.5, channel: "sms" }]],
    [
      "over the limit",
      [{
        minutesBefore: reminderLimits.appointmentPlanMinutesBefore + 1,
        channel: "sms",
      }],
    ],
  ])("rejects a %s minutesBefore value", async (_label, rules) => {
    const context = harness();

    const result = await context.service.planAppointmentReminders(input(rules));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", field: "rules[0].minutesBefore" },
    });
    expect(context.agendaSource.getAppointment).not.toHaveBeenCalled();
  });

  test("rejects an empty rule list", async () => {
    const context = harness();

    const result = await context.service.planAppointmentReminders(input([]));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", field: "rules" },
    });
  });

  test("rejects too many rules", async () => {
    const context = harness();
    const rules = Array.from(
      { length: reminderLimits.appointmentPlanRules + 1 },
      (_, index) => ({ minutesBefore: index + 1, channel: "sms" as const }),
    );

    const result = await context.service.planAppointmentReminders(input(rules));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", field: "rules" },
    });
  });

  test("rejects an invalid channel", async () => {
    const context = harness();
    const rule = { minutesBefore: 60, channel: "sms" as const };
    Reflect.set(rule, "channel", "email");

    const result = await context.service.planAppointmentReminders(input([rule]));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", field: "rules[0].channel" },
    });
  });

  test("rejects duplicate rules", async () => {
    const context = harness();

    const result = await context.service.planAppointmentReminders(
      input([
        { minutesBefore: 60, channel: "sms" },
        { minutesBefore: 60, channel: "sms" },
      ]),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Duplicate appointment reminder rules are not allowed.",
        field: "rules",
      },
    });
  });

  test("rejects invalid identifiers and additional properties", async () => {
    const context = harness();
    const invalidId = input();
    const inputWithExtra = input();
    const ruleWithExtra = { minutesBefore: 60, channel: "sms" as const };
    Reflect.set(invalidId, "appointmentId", " ");
    Reflect.set(inputWithExtra, "unexpected", true);
    Reflect.set(ruleWithExtra, "unexpected", true);

    const results = await Promise.all([
      context.service.planAppointmentReminders(invalidId),
      context.service.planAppointmentReminders(inputWithExtra),
      context.service.planAppointmentReminders(input([ruleWithExtra])),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ ok: false }),
      expect.objectContaining({ ok: false }),
      expect.objectContaining({ ok: false }),
    ]);
    expect(context.agendaSource.getAppointment).not.toHaveBeenCalled();
  });

  test("looks up Agenda exactly once for multiple rules", async () => {
    const context = harness();

    await context.service.planAppointmentReminders(
      input([
        { minutesBefore: 60, channel: "sms" },
        { minutesBefore: 120, channel: "call" },
      ]),
    );

    expect(context.agendaSource.getAppointment).toHaveBeenCalledTimes(1);
    expect(context.agendaSource.getAppointment).toHaveBeenCalledWith(
      appointment.id,
    );
    expect(context.clock).toHaveBeenCalledTimes(1);
  });

  test("does not send, store, update, read storage, or generate an id", async () => {
    const context = harness();

    await context.service.planAppointmentReminders(input());

    expect(context.sender.send).not.toHaveBeenCalled();
    expect(context.storage.create).not.toHaveBeenCalled();
    expect(context.storage.get).not.toHaveBeenCalled();
    expect(context.storage.list).not.toHaveBeenCalled();
    expect(context.storage.replace).not.toHaveBeenCalled();
    expect(context.generateId).not.toHaveBeenCalled();
  });

  test("returns defensive proposal and skipped-rule copies", async () => {
    const mutableRules = [
      { minutesBefore: 30, channel: "sms" as const },
      { minutesBefore: 180, channel: "call" as const },
    ];
    const context = harness({
      appointment: { id: appointment.id, startAt: "2026-11-27T11:00:00Z" },
    });
    const first = await context.service.planAppointmentReminders(
      input(mutableRules),
    );
    if (!first.ok || first.value.planned[0] === undefined ||
      first.value.skipped[0] === undefined) {
      throw new Error("Synthetic reminder plan was not produced");
    }

    const firstMutableRule = mutableRules[0];
    if (firstMutableRule === undefined) {
      throw new Error("Synthetic mutable rule is missing");
    }
    const secondMutableRule = mutableRules[1];
    if (secondMutableRule === undefined) {
      throw new Error("Synthetic mutable skipped rule is missing");
    }
    firstMutableRule.minutesBefore = 999;
    secondMutableRule.minutesBefore = 999;
    expect(first.value.skipped[0].rule.minutesBefore).toBe(180);
    Reflect.set(first.value.planned[0], "remindAt", "mutated");
    Reflect.set(first.value.planned[0].details, "type", "medication");
    Reflect.set(first.value.skipped[0].rule, "minutesBefore", 999);
    const second = await context.service.planAppointmentReminders(
      input([
        { minutesBefore: 30, channel: "sms" },
        { minutesBefore: 180, channel: "call" },
      ]),
    );

    expect(second).toMatchObject({
      ok: true,
      value: {
        planned: [
          {
            remindAt: "2026-11-27T10:30:00.000Z",
            details: { type: "appointment" },
          },
        ],
        skipped: [{ rule: { minutesBefore: 180, channel: "call" } }],
      },
    });
    if (second.ok && second.value.planned[0] !== undefined) {
      const scheduleInput: ScheduleReminderInput = second.value.planned[0];
      expect(scheduleInput.details).toEqual({ type: "appointment" });
    }
  });
});
