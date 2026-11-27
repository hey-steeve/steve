import {
  inboxLimits,
  type MailGateway,
  type MailGatewayRequest,
  type MailGatewayResponse,
} from "./contracts.ts";
import {
  isOutboundRequestId,
  parseMailGatewayRequest,
  parseMailGatewayResponse,
} from "./validation.ts";

export type ScriptedMailGatewayStep =
  | {
      readonly type: "sent";
      readonly providerMessageId: string;
      readonly sentAt: string;
    }
  | { readonly type: "not-sent" }
  | { readonly type: "failure" };

export interface ScriptedMailGatewayScenario {
  readonly requestId: string;
  readonly steps: readonly ScriptedMailGatewayStep[];
}

export interface ScriptedMailGatewayOptions {
  readonly maximumScenarios?: number;
  readonly maximumStepsPerScenario?: number;
  readonly historyLimit?: number;
}

export type ScriptedMailGatewayHistoryEntry = MailGatewayRequest;

interface ParsedLimits {
  readonly maximumScenarios: number;
  readonly maximumStepsPerScenario: number;
  readonly historyLimit: number;
}

interface ScenarioState {
  readonly steps: readonly ScriptedMailGatewayStep[];
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
  const limit = value === undefined ? fallback : value;
  return Number.isSafeInteger(limit) && Number(limit) >= 1 && Number(limit) <= maximum
    ? Number(limit)
    : undefined;
}

function parseLimits(value: unknown): ParsedLimits | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["maximumScenarios", "maximumStepsPerScenario", "historyLimit"])
  ) {
    return undefined;
  }
  const maximumScenarios = parseLimit(
    value["maximumScenarios"],
    inboxLimits.scriptedMailGatewayScenarios,
    inboxLimits.scriptedMailGatewayScenarios,
  );
  const maximumStepsPerScenario = parseLimit(
    value["maximumStepsPerScenario"],
    inboxLimits.scriptedMailGatewayStepsPerScenario,
    inboxLimits.scriptedMailGatewayStepsPerScenario,
  );
  const historyLimit = parseLimit(
    value["historyLimit"],
    inboxLimits.scriptedMailGatewayHistoryEntries,
    inboxLimits.scriptedMailGatewayHistoryEntries,
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

function copyRequest(request: MailGatewayRequest): MailGatewayRequest {
  const snapshot = {
    requestId: request.requestId,
    to: request.to,
    subject: request.subject,
    attachments: request.attachments.map((attachment) => ({
      ...attachment,
      bytes: new Uint8Array(attachment.bytes),
    })),
  };
  return request.textBody === undefined
    ? snapshot
    : { ...snapshot, textBody: request.textBody };
}

function parseStep(value: unknown): ScriptedMailGatewayStep | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value["type"] === "failure" && hasOnlyKeys(value, ["type"])) {
    return { type: "failure" };
  }
  if (value["type"] === "not-sent" && hasOnlyKeys(value, ["type"])) {
    return { type: "not-sent" };
  }
  if (
    value["type"] !== "sent" ||
    !hasOnlyKeys(value, ["type", "providerMessageId", "sentAt"])
  ) {
    return undefined;
  }
  const response = parseMailGatewayResponse({
    status: "sent",
    providerMessageId: value["providerMessageId"],
    sentAt: value["sentAt"],
  });
  if (response?.status === "sent") {
    return {
      type: "sent",
      providerMessageId: response.providerMessageId,
      sentAt: response.sentAt,
    };
  }
  return undefined;
}

function copyStep(step: ScriptedMailGatewayStep): ScriptedMailGatewayStep {
  return step.type === "sent"
    ? {
        type: "sent",
        providerMessageId: step.providerMessageId,
        sentAt: step.sentAt,
      }
    : { type: step.type };
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
    if (!isRecord(rawScenario) || !hasOnlyKeys(rawScenario, ["requestId", "steps"])) {
      return undefined;
    }
    const requestId = rawScenario["requestId"];
    const rawSteps = copyUnknownArray(rawScenario["steps"]);
    if (
      !isOutboundRequestId(requestId) ||
      scenarios.has(requestId) ||
      rawSteps === undefined ||
      rawSteps.length === 0 ||
      rawSteps.length > limits.maximumStepsPerScenario
    ) {
      return undefined;
    }
    const steps: ScriptedMailGatewayStep[] = [];
    for (const rawStep of rawSteps) {
      const step = parseStep(rawStep);
      if (step === undefined) {
        return undefined;
      }
      steps.push(copyStep(step));
    }
    scenarios.set(requestId, { steps, nextStep: 0 });
  }
  return scenarios;
}

export class ScriptedMailGateway implements MailGateway {
  readonly #scenarios: ReadonlyMap<string, ScenarioState>;
  readonly #history: ScriptedMailGatewayHistoryEntry[] = [];
  readonly #historyLimit: number;

  constructor(scenarios: unknown, options: ScriptedMailGatewayOptions = {}) {
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
      throw new Error("Invalid scripted mail gateway configuration.");
    }
  }

  async send(request: MailGatewayRequest): Promise<MailGatewayResponse> {
    let snapshot: MailGatewayRequest | undefined;
    try {
      snapshot = parseMailGatewayRequest(request);
    } catch {
      snapshot = undefined;
    }
    if (snapshot === undefined) {
      throw new Error("Invalid mail gateway request.");
    }

    this.#history.push(copyRequest(snapshot));
    if (this.#history.length > this.#historyLimit) {
      this.#history.shift();
    }

    const scenario = this.#scenarios.get(snapshot.requestId);
    const step = scenario?.steps[scenario.nextStep];
    if (scenario !== undefined && step !== undefined) {
      scenario.nextStep += 1;
    }
    if (step === undefined || step.type === "not-sent") {
      return { status: "not-sent" };
    }
    if (step.type === "failure") {
      throw new Error("Scripted mail gateway failed.");
    }
    return {
      status: "sent",
      providerMessageId: step.providerMessageId,
      sentAt: step.sentAt,
    };
  }

  getHistory(): readonly ScriptedMailGatewayHistoryEntry[] {
    return this.#history.map((request) => copyRequest(request));
  }
}
