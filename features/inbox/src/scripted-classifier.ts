import {
  inboxLimits,
  type AppointmentConfirmationClassification,
  type InboundMessageClassifier,
  type InboundMessageClassification,
  type NormalizedInboundMessage,
  type ReportClassification,
  type UnsupportedClassification,
} from "./contracts.ts";
import {
  copyMessage,
  isProviderMessageId,
  parseNormalizedMessage,
  parseScriptedClassificationStep,
} from "./validation.ts";

export type ScriptedInboundClassificationStep =
  | AppointmentConfirmationClassification
  | ReportClassification
  | UnsupportedClassification
  | { readonly type: "failure" };

export interface ScriptedInboundMessageScenario {
  readonly providerMessageId: string;
  readonly steps: readonly ScriptedInboundClassificationStep[];
}

export interface ScriptedInboundMessageClassifierOptions {
  readonly maximumScenarios?: number;
  readonly maximumStepsPerScenario?: number;
  readonly historyLimit?: number;
}

interface ParsedLimits {
  readonly maximumScenarios: number;
  readonly maximumStepsPerScenario: number;
  readonly historyLimit: number;
}

interface ScenarioState {
  readonly steps: readonly ScriptedInboundClassificationStep[];
  nextStep: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function copyUnknownArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    copy.push(value[index]);
  }
  return copy;
}

function parseLimit(value: unknown, fallback: number, maximum: number): number | undefined {
  const limit = value ?? fallback;
  return Number.isSafeInteger(limit) && Number(limit) >= 1 && Number(limit) <= maximum
    ? Number(limit)
    : undefined;
}

function parseLimits(value: unknown): ParsedLimits | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "maximumScenarios",
    "maximumStepsPerScenario",
    "historyLimit",
  ])) {
    return undefined;
  }
  const maximumScenarios = parseLimit(
    value["maximumScenarios"],
    inboxLimits.scriptedScenarios,
    inboxLimits.scriptedScenarios,
  );
  const maximumStepsPerScenario = parseLimit(
    value["maximumStepsPerScenario"],
    inboxLimits.scriptedStepsPerScenario,
    inboxLimits.scriptedStepsPerScenario,
  );
  const historyLimit = parseLimit(
    value["historyLimit"],
    inboxLimits.scriptedHistoryEntries,
    inboxLimits.scriptedHistoryEntries,
  );
  if (
    maximumScenarios === undefined ||
    maximumStepsPerScenario === undefined ||
    historyLimit === undefined
  ) {
    return undefined;
  }
  return { maximumScenarios, maximumStepsPerScenario, historyLimit };
}

function copyClassification(
  step: InboundMessageClassification,
): InboundMessageClassification {
  if (step.type === "report") {
    return { type: "report", attachmentIds: [...step.attachmentIds] };
  }
  if (step.type === "appointment-confirmation") {
    const confirmation = {
      type: "appointment-confirmation" as const,
      reference: step.reference,
      startsAt: step.startsAt,
      endsAt: step.endsAt,
    };
    return step.practitionerName === undefined
      ? confirmation
      : { ...confirmation, practitionerName: step.practitionerName };
  }
  return { type: step.type };
}

function copyStep(
  step: ScriptedInboundClassificationStep,
): ScriptedInboundClassificationStep {
  return step.type === "failure" ? { type: "failure" } : copyClassification(step);
}

function parseScenarios(
  value: unknown,
  limits: ParsedLimits,
): ReadonlyMap<string, ScenarioState> | undefined {
  const rawScenarios = copyUnknownArray(value);
  if (rawScenarios === undefined || rawScenarios.length > limits.maximumScenarios) {
    return undefined;
  }
  const scenarios = new Map<string, ScenarioState>();
  for (const rawScenario of rawScenarios) {
    if (!isRecord(rawScenario) || !hasOnlyKeys(rawScenario, ["providerMessageId", "steps"])) {
      return undefined;
    }
    const providerMessageId = rawScenario["providerMessageId"];
    const rawSteps = copyUnknownArray(rawScenario["steps"]);
    if (
      !isProviderMessageId(providerMessageId) ||
      scenarios.has(providerMessageId) ||
      rawSteps === undefined ||
      rawSteps.length === 0 ||
      rawSteps.length > limits.maximumStepsPerScenario
    ) {
      return undefined;
    }
    const steps: ScriptedInboundClassificationStep[] = [];
    for (const rawStep of rawSteps) {
      const step = parseScriptedClassificationStep(rawStep);
      if (step === undefined) {
        return undefined;
      }
      steps.push(copyStep(step));
    }
    scenarios.set(providerMessageId, { steps, nextStep: 0 });
  }
  return scenarios;
}

export class ScriptedInboundMessageClassifier implements InboundMessageClassifier {
  readonly #scenarios: ReadonlyMap<string, ScenarioState>;
  readonly #history: NormalizedInboundMessage[] = [];
  readonly #historyLimit: number;

  constructor(
    scenarios: unknown,
    options: ScriptedInboundMessageClassifierOptions = {},
  ) {
    try {
      const limits = parseLimits(options);
      if (limits === undefined) {
        throw new Error();
      }
      const parsedScenarios = parseScenarios(scenarios, limits);
      if (parsedScenarios === undefined) {
        throw new Error();
      }
      this.#scenarios = parsedScenarios;
      this.#historyLimit = limits.historyLimit;
    } catch {
      throw new Error("Invalid scripted inbound classifier configuration.");
    }
  }

  async classify(
    message: NormalizedInboundMessage,
  ): Promise<InboundMessageClassification> {
    let snapshot: NormalizedInboundMessage | undefined;
    try {
      snapshot = parseNormalizedMessage(message);
    } catch {
      snapshot = undefined;
    }
    if (snapshot === undefined) {
      throw new Error("Invalid normalized inbound message.");
    }

    this.#history.push(copyMessage(snapshot));
    if (this.#history.length > this.#historyLimit) {
      this.#history.shift();
    }

    const scenario = this.#scenarios.get(snapshot.providerMessageId);
    const step = scenario?.steps[scenario.nextStep];
    if (scenario !== undefined && step !== undefined) {
      scenario.nextStep += 1;
    }
    if (step === undefined) {
      return { type: "unsupported" };
    }
    if (step.type === "failure") {
      throw new Error("Scripted inbound classification failed.");
    }
    if (step.type === "report") {
      const attachmentIds = new Set(snapshot.attachments.map((attachment) => attachment.id));
      if (!step.attachmentIds.every((id) => attachmentIds.has(id))) {
        return { type: "unsupported" };
      }
    }
    return copyClassification(step);
  }

  getHistory(): readonly NormalizedInboundMessage[] {
    return this.#history.map((message) => copyMessage(message));
  }
}
