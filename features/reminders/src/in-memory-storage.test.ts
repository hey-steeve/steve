import { expect, test } from "vitest";
import {
  InMemoryReminderStorage,
  type ScheduledReminder,
} from "./index.ts";

const reminder: ScheduledReminder = {
  id: "rem_storage",
  appointmentId: "apt_storage",
  remindAt: "2026-11-27T07:00:00.000Z",
  channel: "sms",
  details: {
    type: "medication",
    instruction: "Use the declared instruction.",
  },
  createdAt: "2026-11-26T09:00:00.000Z",
  attemptCount: 0,
  status: "scheduled",
};

test("creates a deduplicated reminder atomically when calls race", async () => {
  const storage = new InMemoryReminderStorage();

  const outcomes = await Promise.all([
    storage.create(reminder),
    storage.create({ ...reminder, id: "rem_other_1" }),
    storage.create({ ...reminder, id: "rem_other_2" }),
  ]);

  expect(outcomes.filter((outcome) => outcome === "created")).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome === "duplicate")).toHaveLength(2);
});

test("copies nested details on write and read", async () => {
  const storage = new InMemoryReminderStorage();
  const mutableDetails = {
    type: "medication" as const,
    instruction: "Use the declared instruction.",
  };
  await storage.create({ ...reminder, details: mutableDetails });

  mutableDetails.instruction = "Changed input";
  const first = await storage.get(reminder.id);
  if (first === null) {
    throw new Error("missing stored fixture");
  }
  Reflect.set(first.details, "instruction", "Changed read");
  const second = await storage.get(reminder.id);

  expect(second?.details).toEqual({
    type: "medication",
    instruction: "Use the declared instruction.",
  });
});
