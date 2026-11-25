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

export const JEV_TIMEOUT_MS = 1500;

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
  physical:
    "A bodily emergency, including overdose or self-harm, with no suicidal thoughts and no psychological distress.",
  psychological:
    "Suicidal thoughts or psychological distress, with no overdose, no self-harm, and no physical red flag.",
  both: "Suicidal thoughts or psychological distress, together with overdose, self-harm, or a physical red flag.",
  none: "No emergency service channel applies.",
} as const;

const harmOptions = ["yes", "no"] as const;

type Harm = (typeof harmOptions)[number];

const harmCriteria = {
  yes: "Overdose or self-harm is present.",
  no: "Neither overdose nor self-harm is present.",
} as const;

export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  const timeoutMs = input.timeoutMs ?? JEV_TIMEOUT_MS;
  const model = input.model ?? JEV_MODEL;
  const signal = armTimeout(timeoutMs);
  if (signal === undefined) {
    return { label: "need-info", reason: "timeout" };
  }
  let response: Response;
  try {
    response = await whenNotAborted(
      input.fetch(JEV_URL, {
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
            overdoseOrSelfHarm: {
              type: "choice",
              instructions: "Is overdose or self-harm present? Pick exactly one.",
              criteria: harmCriteria,
            },
          },
        }),
        signal,
      }),
      signal,
    );
  } catch (error: unknown) {
    if (signal.aborted || isTimeoutError(error)) {
      return { label: "need-info", reason: "timeout" };
    }
    return { label: "need-info", reason: "network" };
  }

  if (!response.ok) {
    return { label: "need-info", reason: "http" };
  }

  let payload: unknown;
  try {
    payload = await readJson(response, signal);
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

function armTimeout(timeoutMs: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(timeoutMs);
  } catch {
    return undefined;
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) {
    throw signal.reason;
  }
  return whenNotAborted(response.json(), signal);
}

function whenNotAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

type ProbabilityBy<Option extends string> = { readonly [Key in Option]: number };

type ChoiceRead<Option extends string> = {
  readonly choice: Option;
  readonly byOption: ProbabilityBy<Option>;
};

type ScoredResult =
  | {
      readonly label: "consult" | "self-care";
      readonly probability: number;
    }
  | {
      readonly label: "need-info";
      readonly reason: "model" | "below-threshold";
      readonly probability: number;
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
  let harm: Harm | undefined;
  if (answers["overdoseOrSelfHarm"] !== undefined) {
    const choice = readChoice(answers["overdoseOrSelfHarm"], harmOptions);
    if (choice === undefined) {
      return undefined;
    }
    harm = choice.choice;
  }
  return decide(label, channel, harm);
}

function decide(
  label: ChoiceRead<TriageLabel>,
  channel: ChoiceRead<TriageChannel>,
  harm: Harm | undefined,
): ClassifyResult | undefined {
  const emergencyProbability = label.byOption.emergency;
  if (emergencyProbability >= EMERGENCY_MIN_P) {
    if (channel.choice === "none") {
      return {
        label: "need-info",
        reason: "no-channel",
        probability: emergencyProbability,
      };
    }
    const calls = emergencyCalls(channel.choice, harm);
    if (calls === undefined) {
      return undefined;
    }
    return { label: "emergency", probability: emergencyProbability, calls };
  }
  if (label.choice === "emergency") {
    return withOffer(
      {
        label: "need-info",
        reason: "below-threshold",
        probability: emergencyProbability,
      },
      channel.choice,
    );
  }
  if (label.choice === "need-info") {
    return withOffer(
      {
        label: "need-info",
        reason: "model",
        probability: label.byOption["need-info"],
      },
      channel.choice,
    );
  }
  return withOffer(
    { label: label.choice, probability: label.byOption[label.choice] },
    channel.choice,
  );
}

function withOffer(result: ScoredResult, channel: TriageChannel): ClassifyResult {
  if (channel !== "psychological" && channel !== "both") {
    return result;
  }
  return { ...result, calls: [{ type: "call", number: "3114" }] };
}

function emergencyCalls(
  channel: Exclude<TriageChannel, "none">,
  harm: Harm | undefined,
): EmergencyCalls | undefined {
  if (channel === "psychological") {
    return [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ];
  }
  if (channel === "both") {
    if (harm === "yes") {
      return [
        { type: "call", number: "3114" },
        { type: "call", number: "15" },
      ];
    }
    if (harm === "no") {
      return [
        { type: "call", number: "15" },
        { type: "call", number: "3114" },
      ];
    }
    return undefined;
  }
  return [{ type: "call", number: "15" }];
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
  const probabilities = value["probabilities"];
  if (!isRecord(probabilities)) {
    return undefined;
  }
  const byOption = readProbabilities(options, probabilities);
  if (byOption === undefined) {
    return undefined;
  }
  return { choice, byOption };
}

function readProbabilities<Option extends string>(
  options: readonly Option[],
  probabilities: Record<string, unknown>,
): ProbabilityBy<Option> | undefined {
  const collected: Record<string, number> = {};
  if (!fillProbabilities(options, probabilities, collected)) {
    return undefined;
  }
  return collected;
}

function fillProbabilities<Option extends string>(
  options: readonly Option[],
  probabilities: Record<string, unknown>,
  collected: Record<string, number>,
): collected is ProbabilityBy<Option> {
  for (const option of options) {
    const probability = probabilities[option];
    if (!isUnitInterval(probability)) {
      return false;
    }
    collected[option] = probability;
  }
  return true;
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
