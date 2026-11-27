import {
  isValidExternalEventId,
  isValidZonedDateTime,
} from "./calendar-sync.ts";
import { copyAppointment } from "./copy.ts";
import {
  agendaLimits,
  type CalendarGateway,
  type CalendarGatewayRequest,
  type ScriptedCalendarGatewayHistoryEntry,
  type ScriptedCalendarGatewayOptions,
  type ScriptedCalendarGatewayStep,
} from "./types.ts";
import { validateAppointmentId } from "./validation.ts";

const invalidConfiguration = (): never => {
  throw new RangeError("invalid scripted calendar gateway configuration");
};

const hasExactKeys = (value: object, expected: string): boolean =>
  Object.keys(value).sort().join(",") === expected;

const copyStep = (
  step: ScriptedCalendarGatewayStep,
): ScriptedCalendarGatewayStep =>
  step.type === "synced"
    ? {
        type: "synced",
        externalEventId: step.externalEventId,
        syncedAt: step.syncedAt,
      }
    : { type: step.type };

const validateStep = (step: ScriptedCalendarGatewayStep): void => {
  if (typeof step !== "object" || step === null || Array.isArray(step)) {
    invalidConfiguration();
  }
  if (step.type === "rejected" || step.type === "failure") {
    if (!hasExactKeys(step, "type")) invalidConfiguration();
    return;
  }
  if (
    step.type !== "synced" ||
    !hasExactKeys(step, "externalEventId,syncedAt,type") ||
    !isValidExternalEventId(step.externalEventId) ||
    !isValidZonedDateTime(step.syncedAt)
  ) {
    invalidConfiguration();
  }
};

const copyRequest = (
  request: CalendarGatewayRequest,
): CalendarGatewayRequest => ({
  idempotencyKey: request.idempotencyKey,
  appointment: copyAppointment(request.appointment),
});

interface ScenarioState {
  readonly steps: readonly ScriptedCalendarGatewayStep[];
  next: number;
}

export class ScriptedCalendarGateway implements CalendarGateway {
  readonly #scenarios = new Map<string, ScenarioState>();
  readonly #history: CalendarGatewayRequest[] = [];
  readonly #historyLimit: number;

  constructor(options: ScriptedCalendarGatewayOptions) {
    if (
      typeof options !== "object" ||
      options === null ||
      Array.isArray(options) ||
      !hasExactKeys(
        options,
        options.historyLimit === undefined
          ? "scenarios"
          : "historyLimit,scenarios",
      ) ||
      !Array.isArray(options.scenarios)
    ) {
      invalidConfiguration();
    }
    const historyLimit =
      options.historyLimit ??
      agendaLimits.defaultScriptedCalendarGatewayHistoryLength;
    if (
      !Number.isInteger(historyLimit) ||
      historyLimit < 1 ||
      historyLimit > agendaLimits.scriptedCalendarGatewayHistoryLength ||
      options.scenarios.length >
        agendaLimits.scriptedCalendarGatewayScenarioCount
    ) {
      invalidConfiguration();
    }
    this.#historyLimit = historyLimit;
    for (const scenario of options.scenarios) {
      if (
        typeof scenario !== "object" ||
        scenario === null ||
        Array.isArray(scenario) ||
        !hasExactKeys(scenario, "idempotencyKey,steps") ||
        !Array.isArray(scenario.steps) ||
        validateAppointmentId(scenario.idempotencyKey).status === "error" ||
        scenario.steps.length < 1 ||
        scenario.steps.length >
          agendaLimits.scriptedCalendarGatewayStepsPerScenario ||
        this.#scenarios.has(scenario.idempotencyKey)
      ) {
        invalidConfiguration();
      }
      scenario.steps.forEach(validateStep);
      this.#scenarios.set(scenario.idempotencyKey, {
        steps: scenario.steps.map(copyStep),
        next: 0,
      });
    }
  }

  async upsert(request: CalendarGatewayRequest): Promise<unknown> {
    if (
      validateAppointmentId(request.idempotencyKey).status === "error" ||
      request.appointment.id !== request.idempotencyKey ||
      request.appointment.confirmation.status !== "confirmed"
    ) {
      throw new RangeError("invalid scripted calendar gateway request");
    }
    this.#history.push(copyRequest(request));
    if (this.#history.length > this.#historyLimit) this.#history.shift();

    const scenario = this.#scenarios.get(request.idempotencyKey);
    const step = scenario?.steps[scenario.next];
    if (scenario === undefined || step === undefined) {
      return { status: "rejected" };
    }
    scenario.next += 1;
    if (step.type === "failure") {
      throw new Error("scripted calendar gateway failure");
    }
    return step.type === "rejected"
      ? { status: "rejected" }
      : {
          status: "synced",
          externalEventId: step.externalEventId,
          syncedAt: step.syncedAt,
        };
  }

  getHistory(): readonly ScriptedCalendarGatewayHistoryEntry[] {
    return this.#history.map(copyRequest);
  }
}
