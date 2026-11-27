import { describe, expect, test } from "vitest";
import {
  InMemoryReminderStorage,
  MAX_SCRIPTED_HISTORY_ENTRIES,
  MAX_SCRIPTED_MESSAGE_BODY_CHARACTERS,
  MAX_SCRIPTED_REMINDERS,
  MAX_SCRIPTED_STEPS_PER_REMINDER,
  ScriptedReminderSender,
  createReminderService,
  type ReminderChannel,
  type ReminderMessage,
  type ScriptedReminderScenario,
  type ScriptedReminderStep,
} from "./index.ts";

const smsMessage: ReminderMessage = {
  reminderId: "rem_synthetic_sms",
  appointmentId: "apt_synthetic",
  channel: "sms",
  body: "Synthetic appointment reminder.",
};

const callMessage: ReminderMessage = {
  reminderId: "rem_synthetic_call",
  appointmentId: "apt_synthetic",
  channel: "call",
  body: "Synthetic call reminder.",
};

function scenario(
  reminderId: string,
  steps: ScriptedReminderScenario["steps"],
): ScriptedReminderScenario {
  return { reminderId, steps };
}

function integrationHarness(
  channel: ReminderChannel,
  steps: readonly ScriptedReminderStep[],
) {
  let now = new Date("2026-11-27T09:00:00.000Z");
  let appointmentExists = true;
  const sender = new ScriptedReminderSender([
    scenario("rem_integration", steps),
  ]);
  const service = createReminderService({
    agendaSource: {
      getAppointment: async () => appointmentExists
        ? {
            id: "apt_integration",
            startAt: "2026-11-28T10:00:00.000Z",
            title: "Synthetic appointment",
          }
        : null,
    },
    sender,
    storage: new InMemoryReminderStorage(),
    now: () => new Date(now),
    generateId: () => "rem_integration",
  });
  return {
    channel,
    sender,
    service,
    advanceToDueTime() {
      now = new Date("2026-11-27T10:00:00.000Z");
    },
    removeAppointment() {
      appointmentExists = false;
    },
  };
}

async function scheduleIntegrationReminder(
  context: ReturnType<typeof integrationHarness>,
): Promise<void> {
  const result = await context.service.schedule({
    appointmentId: "apt_integration",
    remindAt: "2026-11-27T10:00:00.000Z",
    channel: context.channel,
    details: { type: "appointment" },
  });
  if (!result.ok) {
    throw new Error("Synthetic integration reminder did not schedule");
  }
}

describe("ScriptedReminderSender", () => {
  test("returns an exact success for a sent step", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "sent" }]),
    ]);

    const result = await sender.send(smsMessage);

    expect(result).toEqual({ ok: true });
    expect(Object.keys(result)).toEqual(["ok"]);
  });

  test("returns an exact rejection for a rejected step", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "rejected" }]),
    ]);

    const result = await sender.send(smsMessage);

    expect(result).toEqual({ ok: false });
    expect(Object.keys(result)).toEqual(["ok"]);
  });

  test("throws a generic error for a failure step", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "failure" }]),
    ]);

    await expect(sender.send(smsMessage)).rejects.toThrow(
      "Scripted reminder delivery failed",
    );
  });

  test("consumes successive steps for one reminder in order", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [
        { kind: "rejected" },
        { kind: "sent" },
        { kind: "failure" },
      ]),
    ]);

    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: false });
    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: true });
    await expect(sender.send(smsMessage)).rejects.toThrow(
      "Scripted reminder delivery failed",
    );
  });

  test("keeps scenarios independent for two reminders", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "sent" }]),
      scenario(callMessage.reminderId, [{ kind: "rejected" }]),
    ]);

    await expect(sender.send(callMessage)).resolves.toEqual({ ok: false });
    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: true });
  });

  test("consumes distinct ordered steps for simultaneous sends", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [
        { kind: "sent" },
        { kind: "rejected" },
      ]),
    ]);

    const results = await Promise.all([
      sender.send(smsMessage),
      sender.send(smsMessage),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: false }]);
    expect(sender.getHistory()).toEqual([smsMessage, smsMessage]);
  });

  test("rejects safely for an unknown or exhausted reminder", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "sent" }]),
    ]);

    await expect(sender.send(callMessage)).resolves.toEqual({ ok: false });
    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: true });
    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: false });
  });

  test("records SMS, call, rejection, and failure attempts in order", async () => {
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "rejected" }]),
      scenario(callMessage.reminderId, [{ kind: "failure" }]),
    ]);

    await sender.send(smsMessage);
    await expect(sender.send(callMessage)).rejects.toThrow();

    expect(sender.getHistory()).toEqual([smsMessage, callMessage]);
  });

  test("does not mutate a received message", async () => {
    const sender = new ScriptedReminderSender([]);
    const mutableMessage = structuredClone(smsMessage);
    const originalMessage = structuredClone(mutableMessage);

    await sender.send(mutableMessage);

    expect(mutableMessage).toEqual(originalMessage);
  });

  test("keeps the history snapshot after the caller mutates its message", async () => {
    const sender = new ScriptedReminderSender([]);
    const mutableMessage = structuredClone(smsMessage);
    await sender.send(mutableMessage);

    Reflect.set(mutableMessage, "body", "Changed after send");
    Reflect.set(mutableMessage, "channel", "call");

    expect(sender.getHistory()).toEqual([smsMessage]);
  });

  test("returns defensive history copies", async () => {
    const sender = new ScriptedReminderSender([]);
    await sender.send(smsMessage);
    const history = sender.getHistory();
    const first = history[0];
    if (first === undefined) {
      throw new Error("Expected a scripted reminder history entry");
    }

    Reflect.set(first, "body", "Mutated history");
    Reflect.set(history, 0, callMessage);

    expect(sender.getHistory()).toEqual([smsMessage]);
  });

  test("copies the original scenario configuration", async () => {
    const mutableStep = { kind: "sent" as const };
    const mutableScenario = {
      reminderId: smsMessage.reminderId,
      steps: [mutableStep],
    };
    const sender = new ScriptedReminderSender([mutableScenario]);

    mutableScenario.reminderId = callMessage.reminderId;
    Reflect.set(mutableStep, "kind", "failure");
    mutableScenario.steps.push({ kind: "sent" });

    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: true });
    await expect(sender.send(smsMessage)).resolves.toEqual({ ok: false });
  });

  test("snapshots message getters once before use", async () => {
    const changingMessage = structuredClone(smsMessage);
    let reminderIdReads = 0;
    let appointmentIdReads = 0;
    let channelReads = 0;
    let bodyReads = 0;
    Object.defineProperty(changingMessage, "reminderId", {
      enumerable: true,
      get() {
        reminderIdReads += 1;
        return reminderIdReads === 1 ? smsMessage.reminderId : "rem_changed";
      },
    });
    Object.defineProperty(changingMessage, "appointmentId", {
      enumerable: true,
      get() {
        appointmentIdReads += 1;
        return appointmentIdReads === 1
          ? smsMessage.appointmentId
          : "apt_changed";
      },
    });
    Object.defineProperty(changingMessage, "channel", {
      enumerable: true,
      get() {
        channelReads += 1;
        return channelReads === 1 ? "sms" : "call";
      },
    });
    Object.defineProperty(changingMessage, "body", {
      enumerable: true,
      get() {
        bodyReads += 1;
        return bodyReads === 1 ? smsMessage.body : "Changed body";
      },
    });
    const sender = new ScriptedReminderSender([
      scenario(smsMessage.reminderId, [{ kind: "sent" }]),
    ]);

    const result = await sender.send(changingMessage);

    expect(result).toEqual({ ok: true });
    expect(sender.getHistory()).toEqual([smsMessage]);
    expect({ reminderIdReads, appointmentIdReads, channelReads, bodyReads })
      .toEqual({
        reminderIdReads: 1,
        appointmentIdReads: 1,
        channelReads: 1,
        bodyReads: 1,
      });
  });

  test("rejects duplicate reminder scenarios", () => {
    expect(
      () =>
        new ScriptedReminderSender([
          scenario(smsMessage.reminderId, [{ kind: "sent" }]),
          scenario(smsMessage.reminderId, [{ kind: "rejected" }]),
        ]),
    ).toThrow("Invalid scripted reminder sender configuration");
  });

  test("rejects invalid reminder identifiers and steps", () => {
    const invalidStep = { kind: "sent" as const };
    const stepWithExtraField = { kind: "sent" as const };
    Reflect.set(invalidStep, "kind", "ambiguous");
    Reflect.set(stepWithExtraField, "unexpected", true);

    expect(
      () =>
        new ScriptedReminderSender([
          scenario(" ", [{ kind: "sent" }]),
        ]),
    ).toThrow("Invalid scripted reminder sender configuration");
    expect(
      () =>
        new ScriptedReminderSender([
          scenario(smsMessage.reminderId, [stepWithExtraField]),
        ]),
    ).toThrow("Invalid scripted reminder sender configuration");
    expect(
      () =>
        new ScriptedReminderSender([
          scenario(smsMessage.reminderId, [invalidStep]),
        ]),
    ).toThrow("Invalid scripted reminder sender configuration");
  });

  test("rejects too many scenarios or steps", () => {
    const scenarios = Array.from(
      { length: MAX_SCRIPTED_REMINDERS + 1 },
      (_, index) => scenario(`rem_synthetic_${index}`, [{ kind: "sent" }]),
    );
    const steps = Array.from(
      { length: MAX_SCRIPTED_STEPS_PER_REMINDER + 1 },
      () => ({ kind: "sent" as const }),
    );

    expect(() => new ScriptedReminderSender(scenarios)).toThrow(
      "Invalid scripted reminder sender configuration",
    );
    expect(
      () =>
        new ScriptedReminderSender([
          scenario(smsMessage.reminderId, steps),
        ]),
    ).toThrow("Invalid scripted reminder sender configuration");
  });

  test("keeps history within the configured bound", async () => {
    const sender = new ScriptedReminderSender([], { historyLimit: 2 });

    await sender.send({ ...smsMessage, reminderId: "rem_first" });
    await sender.send({ ...smsMessage, reminderId: "rem_second" });
    await sender.send({ ...smsMessage, reminderId: "rem_third" });

    expect(sender.getHistory().map((message) => message.reminderId)).toEqual([
      "rem_second",
      "rem_third",
    ]);
  });

  test("rejects invalid history limits", () => {
    expect(
      () =>
        new ScriptedReminderSender([], {
          historyLimit: MAX_SCRIPTED_HISTORY_ENTRIES + 1,
        }),
    ).toThrow("Invalid scripted reminder sender configuration");
  });

  test("rejects invalid messages before recording them", async () => {
    const sender = new ScriptedReminderSender([]);
    const invalidReminderId = structuredClone(smsMessage);
    const invalidAppointmentId = structuredClone(smsMessage);
    const invalidChannel = structuredClone(smsMessage);
    const emptyBody = structuredClone(smsMessage);
    const oversizedBody = structuredClone(smsMessage);
    Reflect.set(invalidReminderId, "reminderId", " ");
    Reflect.set(invalidAppointmentId, "appointmentId", " ");
    Reflect.set(invalidChannel, "channel", "email");
    Reflect.set(emptyBody, "body", "");
    Reflect.set(oversizedBody, "body", "x".repeat(
      MAX_SCRIPTED_MESSAGE_BODY_CHARACTERS + 1,
    ));

    for (const message of [
      invalidReminderId,
      invalidAppointmentId,
      invalidChannel,
      emptyBody,
      oversizedBody,
    ]) {
      await expect(sender.send(message)).rejects.toThrow(
        "Invalid reminder message",
      );
    }
    expect(sender.getHistory()).toEqual([]);
  });

  test("marks a due SMS sent for a sent step", async () => {
    const context = integrationHarness("sms", [{ kind: "sent" }]);
    await scheduleIntegrationReminder(context);
    context.advanceToDueTime();

    await context.service.dispatchDue();
    const reminders = await context.service.list();

    expect(reminders).toMatchObject({
      ok: true,
      value: [{ status: "sent", channel: "sms" }],
    });
  });

  test("marks a due call sent for a sent step", async () => {
    const context = integrationHarness("call", [{ kind: "sent" }]);
    await scheduleIntegrationReminder(context);
    context.advanceToDueTime();

    await context.service.dispatchDue();
    const reminders = await context.service.list();

    expect(reminders).toMatchObject({
      ok: true,
      value: [{ status: "sent", channel: "call" }],
    });
  });

  test("marks a rejected scripted attempt failed", async () => {
    const context = integrationHarness("sms", [{ kind: "rejected" }]);
    await scheduleIntegrationReminder(context);
    context.advanceToDueTime();

    await context.service.dispatchDue();
    const reminders = await context.service.list();

    expect(reminders).toMatchObject({
      ok: true,
      value: [{ status: "failed", failureReason: "delivery-failed" }],
    });
  });

  test("contains a scripted failure without leaking its error", async () => {
    const context = integrationHarness("sms", [{ kind: "failure" }]);
    await scheduleIntegrationReminder(context);
    context.advanceToDueTime();

    const report = await context.service.dispatchDue();
    const reminders = await context.service.list();

    expect(reminders).toMatchObject({
      ok: true,
      value: [{ status: "failed", failureReason: "delivery-failed" }],
    });
    expect(JSON.stringify({ report, reminders })).not.toContain(
      "Scripted reminder delivery failed",
    );
  });

  test("consumes the next step and succeeds on explicit retry", async () => {
    const context = integrationHarness("sms", [
      { kind: "rejected" },
      { kind: "sent" },
    ]);
    await scheduleIntegrationReminder(context);
    context.advanceToDueTime();

    const first = await context.service.dispatchDue();
    const second = await context.service.dispatchDue();

    expect(first).toMatchObject({
      ok: true,
      value: { outcomes: [{ outcome: "failed" }] },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { outcomes: [{ outcome: "sent" }] },
    });
    expect(context.sender.getHistory()).toHaveLength(2);
  });

  test("never calls the sender for a cancelled reminder", async () => {
    const context = integrationHarness("sms", [{ kind: "sent" }]);
    await scheduleIntegrationReminder(context);
    await context.service.cancel("rem_integration");
    context.advanceToDueTime();

    await context.service.dispatchDue();

    expect(context.sender.getHistory()).toEqual([]);
  });

  test("never calls the sender after the Agenda appointment is deleted", async () => {
    const context = integrationHarness("sms", [{ kind: "sent" }]);
    await scheduleIntegrationReminder(context);
    context.removeAppointment();
    context.advanceToDueTime();

    await context.service.dispatchDue();

    expect(context.sender.getHistory()).toEqual([]);
  });

  test("records no duplicate delivery after a reminder is sent", async () => {
    const context = integrationHarness("sms", [{ kind: "sent" }]);
    await scheduleIntegrationReminder(context);
    context.advanceToDueTime();

    await context.service.dispatchDue();
    await context.service.dispatchDue();

    expect(context.sender.getHistory()).toHaveLength(1);
  });
});
