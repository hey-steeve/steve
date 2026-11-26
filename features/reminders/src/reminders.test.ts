import { describe, expect, test, vi } from "vitest";
import {
  InMemoryReminderStorage,
  createReminderService,
  reminderLimits,
  type AgendaAppointment,
  type AgendaSource,
  type ReminderDependencies,
  type ReminderStorage,
  type ScheduleReminderInput,
} from "./index.ts";

const currentTime = "2026-11-26T09:00:00.000Z";
const appointment: AgendaAppointment = {
  id: "apt_synthetic",
  startAt: "2026-11-27T10:00:00+01:00",
  title: "Synthetic consultation",
  location: "Synthetic clinic",
};

function agenda(value: AgendaAppointment | null = appointment): AgendaSource {
  return { getAppointment: vi.fn(async () => value) };
}

function input(
  overrides: Partial<ScheduleReminderInput> = {},
): ScheduleReminderInput {
  return {
    appointmentId: appointment.id,
    remindAt: "2026-11-27T08:00:00+01:00",
    channel: "sms",
    details: { type: "appointment" },
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<ReminderDependencies> = {},
): ReminderDependencies {
  return {
    agendaSource: agenda(),
    storage: new InMemoryReminderStorage(),
    now: () => new Date(currentTime),
    generateId: () => "rem_synthetic",
    ...overrides,
  };
}

describe("reminder scheduling", () => {
  test("schedules an appointment reminder only after finding the appointment", async () => {
    const agendaSource = agenda();
    const service = createReminderService(dependencies({ agendaSource }));

    const result = await service.schedule(input());

    expect(result).toEqual({
      ok: true,
      value: {
        id: "rem_synthetic",
        appointmentId: "apt_synthetic",
        remindAt: "2026-11-27T07:00:00.000Z",
        channel: "sms",
        details: { type: "appointment" },
        createdAt: currentTime,
        status: "scheduled",
      },
    });
    expect(agendaSource.getAppointment).toHaveBeenCalledWith("apt_synthetic");
  });

  test("copies a declared medication instruction without adding content", async () => {
    const service = createReminderService(dependencies());

    const result = await service.schedule(
      input({
        channel: "call",
        details: {
          type: "medication",
          instruction: "Take the declared tablet with water.",
        },
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        channel: "call",
        details: {
          type: "medication",
          instruction: "Take the declared tablet with water.",
        },
      },
    });
  });

  test("rejects a missing Agenda appointment", async () => {
    const service = createReminderService(
      dependencies({ agendaSource: agenda(null) }),
    );

    await expect(service.schedule(input())).resolves.toEqual({
      ok: false,
      error: {
        code: "APPOINTMENT_NOT_FOUND",
        message: "Appointment was not found in Agenda.",
      },
    });
  });

  test.each<[string, string]>([
    ["a timestamp without a timezone", "2026-11-27T07:00:00"],
    ["a past timestamp", "2026-11-26T08:59:59Z"],
    ["the appointment start", "2026-11-27T10:00:00+01:00"],
    ["a timestamp after the appointment", "2026-11-27T10:01:00+01:00"],
  ])("rejects %s", async (_label, remindAt) => {
    const service = createReminderService(dependencies());

    const result = await service.schedule(input({ remindAt }));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_REMINDER_TIME", field: "remindAt" },
    });
  });

  test.each<[string, Partial<ScheduleReminderInput>]>([
    ["an empty appointment id", { appointmentId: " " }],
    [
      "an overlong appointment id",
      { appointmentId: `a${"x".repeat(reminderLimits.identifierCharacters)}` },
    ],
    [
      "an empty medication instruction",
      { details: { type: "medication", instruction: " " } },
    ],
    [
      "an overlong medication instruction",
      {
        details: {
          type: "medication",
          instruction: "x".repeat(
            reminderLimits.medicationInstructionCharacters + 1,
          ),
        },
      },
    ],
  ])("rejects %s", async (_label, overrides) => {
    const service = createReminderService(dependencies());

    const result = await service.schedule(input(overrides));

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  test("prevents duplicate appointment/type/channel/time combinations", async () => {
    let nextId = 0;
    const service = createReminderService(
      dependencies({ generateId: () => `rem_${nextId += 1}` }),
    );
    await service.schedule(input());

    const duplicate = await service.schedule(input());

    expect(duplicate).toEqual({
      ok: false,
      error: {
        code: "DUPLICATE_REMINDER",
        message: "An identical reminder already exists.",
      },
    });
  });

  test("lists reminders by time and then identifier", async () => {
    const ids = ["rem_z", "rem_b", "rem_a"];
    const service = createReminderService(
      dependencies({ generateId: () => ids.shift() ?? "rem_unused" }),
    );
    await service.schedule(
      input({
        remindAt: "2026-11-27T08:30:00+01:00",
        channel: "call",
      }),
    );
    await service.schedule(input({ channel: "call" }));
    await service.schedule(input({ channel: "sms" }));

    const listed = await service.list();

    expect(listed).toMatchObject({
      ok: true,
      value: [{ id: "rem_a" }, { id: "rem_b" }, { id: "rem_z" }],
    });
  });

  test("cancels once and makes a second cancellation explicit", async () => {
    const service = createReminderService(dependencies());
    await service.schedule(input());

    const first = await service.cancel("rem_synthetic");
    const second = await service.cancel("rem_synthetic");

    expect(first).toMatchObject({
      ok: true,
      value: {
        outcome: "cancelled",
        reminder: {
          status: "cancelled",
          cancelledAt: currentTime,
          cancellationReason: "requested",
        },
      },
    });
    expect(second).toMatchObject({
      ok: true,
      value: { outcome: "already-cancelled", reminder: { status: "cancelled" } },
    });
  });

  test("reports a full bounded storage", async () => {
    let nextId = 0;
    const service = createReminderService(
      dependencies({
        storage: new InMemoryReminderStorage(1),
        generateId: () => `rem_${nextId += 1}`,
      }),
    );
    await service.schedule(input());

    const result = await service.schedule(
      input({ channel: "call", details: { type: "appointment" } }),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "STORAGE_FULL", message: "Reminder storage is full." },
    });
  });

  test("contains storage exceptions and invalid storage outcomes", async () => {
    const throwingStorage: ReminderStorage = {
      create: vi.fn(async () => {
        throw new Error("secret database exception");
      }),
      get: vi.fn(async () => null),
      list: vi.fn(async () => []),
      replace: vi.fn(async () => "updated" as const),
    };
    const service = createReminderService(
      dependencies({ storage: throwingStorage }),
    );

    const result = await service.schedule(input());

    expect(result).toEqual({
      ok: false,
      error: { code: "STORAGE_FAILURE", message: "Reminder storage failed." },
    });
    expect(JSON.stringify(result)).not.toContain("secret database exception");
  });

  test("keeps defensive copies across input, output, and list boundaries", async () => {
    const mutableDetails = {
      type: "medication" as const,
      instruction: "Use the declared instruction.",
    };
    const service = createReminderService(dependencies());
    const scheduled = await service.schedule(input({ details: mutableDetails }));
    if (!scheduled.ok) {
      throw new Error("fixture did not schedule");
    }

    mutableDetails.instruction = "Changed input";
    Reflect.set(scheduled.value.details, "instruction", "Changed output");
    const firstList = await service.list();
    if (!firstList.ok || firstList.value[0] === undefined) {
      throw new Error("fixture was not listed");
    }
    Reflect.set(firstList.value[0].details, "instruction", "Changed list");
    const secondList = await service.list();

    expect(secondList).toMatchObject({
      ok: true,
      value: [
        {
          details: {
            type: "medication",
            instruction: "Use the declared instruction.",
          },
        },
      ],
    });
  });
});
