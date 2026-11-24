import {
  EMERGENCY_MIN_P,
  triageChannels,
  triageLabels,
  type ClassifyResult,
  type EmergencyCalls,
  type TriageChannel,
  type TriageLabel,
} from "./types.ts";

export const JEV_MODEL = "jev-1.14.0";

export const JEV_TIMEOUT_MS = 800;

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";

export type ClassifyInput = {
  readonly state: string;
  readonly fetch: typeof fetch;
  readonly timeoutMs?: number;
  readonly model?: string;
};

const labelCriteria = {
  emergency:
    "Needs emergency services now. Immediate danger to life, or an acute suicide crisis.",
  consult: "A clinician should see the person soon. This is not an emergency.",
  "self-care": "Mild and stable. Manageable without a clinician visit.",
  "need-info": "Not enough information to choose emergency, consult, or self-care.",
} as const;

const channelCriteria = {
  physical: "The concern is bodily.",
  psychological: "The concern is mental distress, including a suicidal crisis.",
  both: "Both a bodily emergency and a mental-health emergency are present.",
  none: "No emergency service channel applies.",
} as const;

export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  const timeoutMs = input.timeoutMs ?? JEV_TIMEOUT_MS;
  const model = input.model ?? JEV_MODEL;
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await input.fetch(JEV_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        state: input.state,
        questions: {
          label: {
            type: "choice",
            instructions: "Which care orientation fits this conversation? Pick exactly one label.",
            criteria: labelCriteria,
          },
          channel: {
            type: "choice",
            instructions: "Which emergency service channel applies? Pick exactly one.",
            criteria: channelCriteria,
          },
        },
      }),
      signal,
    });
  } catch (error: unknown) {
    if (signal.aborted || isTimeoutError(error)) {
      return { label: "need-info", reason: "timeout" };
    }
    return { label: "need-info", reason: "http" };
  }

  if (!response.ok) {
    return { label: "need-info", reason: "http" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    if (signal.aborted || isTimeoutError(error)) {
      return { label: "need-info", reason: "timeout" };
    }
    return { label: "need-info", reason: "malformed" };
  }

  const classified = classifyPayload(payload);
  if (classified === undefined) {
    return { label: "need-info", reason: "malformed" };
  }
  return classified;
}

type ChoiceRead<Option extends string> = {
  readonly choice: Option;
  readonly byOption: ReadonlyMap<Option, number>;
};

function classifyPayload(payload: unknown): ClassifyResult | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const answers = payload["answers"];
  if (!isRecord(answers)) {
    return undefined;
  }
  const label = readChoice(answers["label"], triageLabels);
  const channel = readChoice(answers["channel"], triageChannels);
  if (label === undefined || channel === undefined) {
    return undefined;
  }
  return decide(label, channel.choice);
}

function decide(
  label: ChoiceRead<TriageLabel>,
  channel: TriageChannel,
): ClassifyResult | undefined {
  const emergencyProbability = label.byOption.get("emergency");
  const selected = label.byOption.get(label.choice);
  if (emergencyProbability === undefined || selected === undefined) {
    return undefined;
  }
  if (label.choice === "emergency") {
    if (emergencyProbability < EMERGENCY_MIN_P) {
      return {
        label: "need-info",
        reason: "below-threshold",
        probability: emergencyProbability,
      };
    }
    if (channel === "none") {
      return {
        label: "need-info",
        reason: "no-channel",
        probability: emergencyProbability,
      };
    }
    return {
      label: "emergency",
      probability: emergencyProbability,
      calls: callsFor(channel),
    };
  }
  if (label.choice === "need-info") {
    return { label: "need-info", reason: "model", probability: selected };
  }
  return { label: label.choice, probability: selected };
}

function callsFor(channel: Exclude<TriageChannel, "none">): EmergencyCalls {
  if (channel === "physical") {
    return [{ type: "call", number: "15" }];
  }
  if (channel === "psychological") {
    return [{ type: "call", number: "3114" }];
  }
  return [
    { type: "call", number: "15" },
    { type: "call", number: "3114" },
  ];
}

function readChoice<Option extends string>(
  value: unknown,
  options: readonly Option[],
): ChoiceRead<Option> | undefined {
  if (!isRecord(value) || value["type"] !== "choice") {
    return undefined;
  }
  const choice = value["choice"];
  if (typeof choice !== "string" || !hasOption(options, choice)) {
    return undefined;
  }
  if (!isUnitInterval(value["confidence"])) {
    return undefined;
  }
  const probabilities = value["probabilities"];
  if (!isRecord(probabilities)) {
    return undefined;
  }
  const byOption = new Map<Option, number>();
  for (const option of options) {
    const probability = probabilities[option];
    if (!isUnitInterval(probability)) {
      return undefined;
    }
    byOption.set(option, probability);
  }
  return { choice, byOption };
}

function hasOption<Option extends string>(
  options: readonly Option[],
  value: string,
): value is Option {
  for (const option of options) {
    if (option === value) {
      return true;
    }
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  const name = error["name"];
  return name === "TimeoutError" || name === "AbortError";
}
