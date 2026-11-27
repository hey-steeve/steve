import type {
  ConfirmedSlot,
  PracticeCallInput,
  PracticeCaller,
  PracticeCallResponse,
} from "./index.ts";
import {
  copyPractitioner,
  copyRequest,
  copyValidCandidate,
  copyValidRequest,
  copyWindow,
  isNonEmptyString,
  isRecord,
  isValidWindow,
} from "./validation.ts";

export const MAX_SCRIPTED_PRACTITIONERS = 50;
export const MAX_SCRIPTED_STEPS_PER_PRACTITIONER = 20;
export const MAX_SCRIPTED_HISTORY_ENTRIES = 100;

export type ScriptedPracticeStep =
  | {
      readonly kind: "confirmed";
      readonly confirmationId: string;
      readonly slot: ConfirmedSlot;
    }
  | { readonly kind: "refused" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failure" };

export interface ScriptedPracticeScenario {
  readonly practitionerId: string;
  readonly steps: readonly ScriptedPracticeStep[];
}

export interface ScriptedPracticeCallerOptions {
  readonly historyLimit?: number;
}

export class ScriptedPracticeCaller implements PracticeCaller {
  readonly #stepsByPractitioner: Map<string, ScriptedPracticeStep[]>;
  readonly #historyLimit: number;
  readonly #history: PracticeCallInput[] = [];

  constructor(
    scenarios: readonly ScriptedPracticeScenario[],
    options: ScriptedPracticeCallerOptions = {},
  ) {
    this.#historyLimit = validHistoryLimit(options.historyLimit);
    this.#stepsByPractitioner = copyValidScenarios(scenarios);
  }

  async callPractice(input: PracticeCallInput): Promise<PracticeCallResponse> {
    const snapshot = copyValidInput(input);
    this.#record(snapshot);

    const steps = this.#stepsByPractitioner.get(snapshot.practitioner.practitionerId);
    const step = steps?.shift();

    if (step === undefined || step.kind === "unavailable") {
      return { kind: "unavailable" };
    }

    if (step.kind === "failure") {
      throw new Error("Scripted practice call failed");
    }

    if (step.kind === "refused") {
      return { kind: "refused" };
    }

    return {
      kind: "confirmed",
      confirmationId: step.confirmationId,
      slot: copyWindow(step.slot),
    };
  }

  getHistory(): readonly PracticeCallInput[] {
    return this.#history.map(copyInput);
  }

  #record(input: PracticeCallInput): void {
    this.#history.push(copyInput(input));

    if (this.#history.length > this.#historyLimit) {
      this.#history.shift();
    }
  }
}

function copyValidScenarios(
  scenarios: readonly ScriptedPracticeScenario[],
): Map<string, ScriptedPracticeStep[]> {
  if (!Array.isArray(scenarios) || scenarios.length > MAX_SCRIPTED_PRACTITIONERS) {
    throw new TypeError("Invalid scripted practice scenarios");
  }

  const result = new Map<string, ScriptedPracticeStep[]>();

  for (const scenario of scenarios) {
    if (
      !isRecord(scenario) ||
      !isNonEmptyString(scenario["practitionerId"]) ||
      !Array.isArray(scenario["steps"]) ||
      scenario["steps"].length > MAX_SCRIPTED_STEPS_PER_PRACTITIONER ||
      result.has(scenario["practitionerId"])
    ) {
      throw new TypeError("Invalid scripted practice scenario");
    }

    result.set(
      scenario["practitionerId"],
      scenario["steps"].map(copyValidStep),
    );
  }

  return result;
}

function copyValidStep(step: ScriptedPracticeStep): ScriptedPracticeStep {
  if (!isRecord(step) || typeof step["kind"] !== "string") {
    throw new TypeError("Invalid scripted practice step");
  }

  if (step["kind"] === "refused" || step["kind"] === "unavailable") {
    return { kind: step["kind"] };
  }

  if (step["kind"] === "failure") {
    return { kind: "failure" };
  }

  if (
    step["kind"] === "confirmed" &&
    isNonEmptyString(step["confirmationId"]) &&
    isValidWindow(step["slot"])
  ) {
    return {
      kind: "confirmed",
      confirmationId: step["confirmationId"],
      slot: copyWindow(step["slot"]),
    };
  }

  throw new TypeError("Invalid scripted practice step");
}

function validHistoryLimit(value: number | undefined): number {
  const limit = value ?? MAX_SCRIPTED_HISTORY_ENTRIES;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCRIPTED_HISTORY_ENTRIES) {
    throw new TypeError("Invalid scripted practice history limit");
  }

  return limit;
}

function copyValidInput(input: PracticeCallInput): PracticeCallInput {
  if (!isRecord(input)) {
    throw new TypeError("Invalid practice call input");
  }

  return {
    request: copyValidRequest(input.request),
    practitioner: copyValidCandidate(input.practitioner),
  };
}

function copyInput(input: PracticeCallInput): PracticeCallInput {
  return {
    request: copyRequest(input.request),
    practitioner: copyPractitioner(input.practitioner),
  };
}
