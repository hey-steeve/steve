import {
  reminderLimits,
  type ReminderMessage,
  type ReminderSender,
  type ReminderSenderResult,
} from "./contracts.ts";
import {
  validIdentifier,
  validateReminderMessage,
} from "./validation.ts";

export const MAX_SCRIPTED_REMINDERS = reminderLimits.scriptedScenarios;
export const MAX_SCRIPTED_STEPS_PER_REMINDER =
  reminderLimits.scriptedStepsPerScenario;
export const MAX_SCRIPTED_HISTORY_ENTRIES =
  reminderLimits.scriptedHistoryEntries;
export const MAX_SCRIPTED_MESSAGE_BODY_CHARACTERS =
  reminderLimits.messageBodyCharacters;

export type ScriptedReminderStep =
  | { readonly kind: "sent" }
  | { readonly kind: "rejected" }
  | { readonly kind: "failure" };

export interface ScriptedReminderScenario {
  readonly reminderId: string;
  readonly steps: readonly ScriptedReminderStep[];
}

export interface ScriptedReminderSenderOptions {
  readonly historyLimit?: number;
}

export class ScriptedReminderSender implements ReminderSender {
  readonly #stepsByReminder: Map<string, ScriptedReminderStep[]>;
  readonly #historyLimit: number;
  readonly #history: ReminderMessage[] = [];

  constructor(
    scenarios: readonly ScriptedReminderScenario[],
    options: ScriptedReminderSenderOptions = {},
  ) {
    try {
      const historyLimit: unknown = options.historyLimit;
      this.#historyLimit = validHistoryLimit(historyLimit);
      this.#stepsByReminder = copyValidScenarios(scenarios);
    } catch {
      throw new TypeError("Invalid scripted reminder sender configuration");
    }
  }

  async send(message: ReminderMessage): Promise<ReminderSenderResult> {
    const snapshot = copyValidMessage(message);
    this.#record(snapshot);

    const step = this.#stepsByReminder.get(snapshot.reminderId)?.shift();
    if (step === undefined || step.kind === "rejected") {
      return { ok: false };
    }
    if (step.kind === "failure") {
      throw new Error("Scripted reminder delivery failed");
    }
    return { ok: true };
  }

  getHistory(): readonly ReminderMessage[] {
    return this.#history.map(copyMessage);
  }

  #record(message: ReminderMessage): void {
    this.#history.push(copyMessage(message));
    if (this.#history.length > this.#historyLimit) {
      this.#history.shift();
    }
  }
}

function copyValidScenarios(
  scenarios: readonly ScriptedReminderScenario[],
): Map<string, ScriptedReminderStep[]> {
  if (!Array.isArray(scenarios) || scenarios.length > MAX_SCRIPTED_REMINDERS) {
    throw new TypeError("Invalid scripted reminder scenarios");
  }

  const result = new Map<string, ScriptedReminderStep[]>();
  for (const scenario of scenarios) {
    if (!isRecord(scenario)) {
      throw new TypeError("Invalid scripted reminder scenario");
    }
    const reminderId: unknown = Reflect.get(scenario, "reminderId");
    const steps: unknown = Reflect.get(scenario, "steps");
    const validReminderId = validIdentifier(reminderId, "reminderId");
    if (
      !validReminderId.ok ||
      validReminderId.value !== reminderId ||
      !Array.isArray(steps) ||
      steps.length > MAX_SCRIPTED_STEPS_PER_REMINDER ||
      result.has(validReminderId.value)
    ) {
      throw new TypeError("Invalid scripted reminder scenario");
    }
    result.set(validReminderId.value, steps.map(copyValidStep));
  }
  return result;
}

function copyValidStep(step: ScriptedReminderStep): ScriptedReminderStep {
  if (!isRecord(step)) {
    throw new TypeError("Invalid scripted reminder step");
  }
  const keys = Object.keys(step);
  const kind: unknown = Reflect.get(step, "kind");
  if (keys.length !== 1 || keys[0] !== "kind") {
    throw new TypeError("Invalid scripted reminder step");
  }
  if (kind === "sent" || kind === "rejected" || kind === "failure") {
    return { kind };
  }
  throw new TypeError("Invalid scripted reminder step");
}

function validHistoryLimit(value: unknown): number {
  const limit = value === undefined ? MAX_SCRIPTED_HISTORY_ENTRIES : value;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_SCRIPTED_HISTORY_ENTRIES
  ) {
    throw new TypeError("Invalid scripted reminder history limit");
  }
  return limit;
}

function copyValidMessage(message: ReminderMessage): ReminderMessage {
  const validated = validateReminderMessage(message);
  if (!validated.ok) {
    throw new TypeError("Invalid reminder message");
  }
  return validated.value;
}

function copyMessage(message: ReminderMessage): ReminderMessage {
  return {
    reminderId: message.reminderId,
    appointmentId: message.appointmentId,
    channel: message.channel,
    body: message.body,
  };
}

function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
