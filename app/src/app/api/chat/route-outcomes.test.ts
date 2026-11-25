import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JEV_URL } from "@steve/triage";
import {
  call15Now,
  call3114Now,
  emergencySafetySentence,
  refusal112,
  refusalSos,
} from "./emergency-templates.js";
import { checkEmergencyReply, type EmergencyNumber } from "./eval/check.js";
import { withoutSafetySentence } from "./eval/score-reply.js";
import { POST } from "./route.js";
import { resetTriageLog } from "./triage-log.js";

// Class guard for audit bug class A: safety must not hold only on the happy path.
// Every Jev outcome meets every model outcome through the real route with a stubbed fetch.
// Each visible text (reply on 200, error on 502) is scored with the eval checker.

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const upstreamError = "Le service de chat est indisponible. Réessayez.";
const keyCanary = "synthetic-outcome-key";
const userTurn = { messages: [{ role: "user", content: "Je me sens un peu triste ces jours-ci." }] };

type Calls = readonly EmergencyNumber[];

type JevKind = "emergency" | "offer" | "routine" | "no-triage";

type JevOutcome = {
  readonly id: string;
  readonly kind: JevKind;
  // The call buttons the client must receive. Empty when Jev gives none.
  readonly calls: Calls;
  // Null means the JEV key is missing and Jev is never called.
  readonly respond: (() => Response) | null;
};

type ModelOutcome = {
  readonly id: string;
  readonly respond: () => Response;
  // The model text, when the model answers 200 with usable text.
  readonly text?: string;
  // The model text names its own 15 on purpose. See `ownsNumbers`.
  readonly namesOwn15?: true;
  // The model text is the two exact refusal sentences the prompt asks for. See `withoutRefusals`.
  readonly refusalsOnly?: true;
};

const jevOutcomes: readonly JevOutcome[] = [
  {
    id: "emergency-psych 3114,15",
    kind: "emergency",
    calls: ["3114", "15"],
    respond: () => Response.json(jevBody("emergency", 0.91, "psychological")),
  },
  {
    id: "emergency-physical 15",
    kind: "emergency",
    calls: ["15"],
    respond: () => Response.json(jevBody("emergency", 0.91, "physical", "no")),
  },
  {
    id: "emergency-both 15,3114",
    kind: "emergency",
    calls: ["15", "3114"],
    respond: () => Response.json(jevBody("emergency", 0.91, "both", "no")),
  },
  {
    id: "ok non-urgent",
    kind: "routine",
    calls: [],
    respond: () => Response.json(jevBody("consult", 0.74, "none")),
  },
  {
    id: "ok 3114 offer",
    kind: "offer",
    calls: ["3114"],
    respond: () => Response.json(jevBody("consult", 0.74, "psychological")),
  },
  {
    id: "error http 500",
    kind: "no-triage",
    calls: [],
    respond: () => new Response("upstream", { status: 500 }),
  },
  {
    id: "timeout",
    kind: "no-triage",
    calls: [],
    respond: () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    },
  },
  {
    id: "malformed JSON",
    kind: "no-triage",
    calls: [],
    respond: () => new Response("{not json", { status: 200 }),
  },
  {
    id: "throw",
    kind: "no-triage",
    calls: [],
    respond: () => {
      throw new TypeError("network down");
    },
  },
  { id: "missing key", kind: "no-triage", calls: [], respond: null },
];

const plain = "Reste au chaud.";
const with112 = `Appelle plutôt le 112. ${plain}`;
const withSos = `Appelle SOS Médecins. ${plain}`;
const withSecond15 = `${call15Now} Appelle le 15. ${plain}`;
const refusalsOnly = `${refusal112} ${refusalSos}`;
const strippedOnly = "Appelle plutôt le 112. Appelle SOS Médecins.";

const modelOutcomes: readonly ModelOutcome[] = [
  { id: "ok plain", respond: () => completion(plain), text: plain },
  { id: "error 503", respond: () => new Response("upstream", { status: 503 }) },
  {
    id: "timeout",
    respond: () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    },
  },
  { id: "empty completion", respond: () => completion("") },
  { id: "null completion", respond: () => completion(null) },
  { id: "content_filter", respond: () => completion("...", "content_filter") },
  { id: "ok with 112", respond: () => completion(with112), text: with112 },
  { id: "ok with SOS Médecins", respond: () => completion(withSos), text: withSos },
  {
    id: "ok with a second Appelle le 15.",
    respond: () => completion(withSecond15),
    text: withSecond15,
    namesOwn15: true,
  },
  {
    id: "ok refusals only",
    respond: () => completion(refusalsOnly),
    text: refusalsOnly,
    refusalsOnly: true,
  },
  { id: "ok only stripped sentences", respond: () => completion(strippedOnly), text: strippedOnly },
];

type Cell = { readonly jev: JevOutcome; readonly model: ModelOutcome };

type Observed = {
  readonly status: number;
  readonly text: string;
  readonly calls: unknown;
};

/**
 * The one place that says which numbers a cell must carry.
 *
 * - Jev emergency: the full opening in Jev's order. The route builds it, so it is exact.
 * - Every other Jev outcome: no number is required from the route. A 3114 offer reaches
 *   the client as call buttons, not as a spoken sentence, and the fallback safety sentence
 *   is scored apart (see `scoredText`).
 */
function expectedNumbers(cell: Cell): Calls {
  return cell.jev.kind === "emergency" ? cell.jev.calls : [];
}

/** Model failures the route must turn into a 502: no usable model text at all. */
function modelFails(cell: Cell): boolean {
  return cell.model.text === undefined;
}

/**
 * A non-urgent turn whose model text is only 112 or SOS sentences is not a failure. The route
 * answers 200 with exactly the safety sentence and keeps the turn's calls. An emergency turn
 * builds its opening from Jev's calls, so the text never matters there.
 */
function replacedBySafety(cell: Cell): boolean {
  const text = cell.model.text;
  return cell.jev.kind !== "emergency" && text !== undefined && keptOutsideServices(text).length === 0;
}

/** The 112 and SOS sentences go, except the two exact refusals the prompt asks for. */
function keptOutsideServices(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => isRefusal(sentence) || !/112|SOS/iu.test(sentence))
    .join(" ")
    .trim();
}

function isRefusal(sentence: string): boolean {
  return sentence === refusal112 || sentence === refusalSos;
}

/**
 * The refusals name 112 and SOS Médecins on purpose, so the "contains" probes look past them.
 * A cell that is not a refusals-only reply on a non-emergency turn gets no such pass.
 */
function withoutRefusals(cell: Cell, text: string): string {
  if (cell.jev.kind === "emergency" || cell.model.refusalsOnly !== true) {
    return text;
  }
  return text.replace(refusal112, "").replace(refusalSos, "");
}

/**
 * `checkEmergencyReply` has no expectation that accepts the safety sentence:
 * "En cas d'urgence, appelle le 15." is neither a call template nor an exact warning,
 * so it counts as an unexpected 15 for every expected list. (A test below pins this.)
 * The safety sentence is therefore asserted by exact presence, and the checker scores
 * the rest of the text. The eval runner cuts the sentence the same way, through the
 * shared `withoutSafetySentence`. Emergency cells carry no safety sentence and are scored whole.
 */
function scoredText(text: string): string {
  if (text.endsWith(upstreamError)) {
    // A 502 text opens with the safety sentence, so it is cut off the front part.
    const head = text.slice(0, text.length - upstreamError.length).trim();
    return `${withoutSafetySentence(head)} ${upstreamError}`.trim();
  }
  return withoutSafetySentence(text);
}

/**
 * A model text that names its own 15 on a turn Jev did not flag keeps that sentence on
 * purpose: the model is the second net when Jev under-triages. The checker would count it
 * as an unexpected 15, so the cell is exempt from the checker only, never from the rest.
 */
function ownsNumbers(cell: Cell): boolean {
  return cell.jev.kind !== "emergency" && cell.model.namesOwn15 === true;
}

function violations(cell: Cell, seen: Observed): string[] {
  const found: string[] = [];
  const emergency = cell.jev.kind === "emergency";
  const failed = modelFails(cell);
  const probed = withoutRefusals(cell, seen.text);
  const wantStatus = failed ? 502 : 200;
  if (seen.status !== wantStatus) {
    found.push(`status ${seen.status}, want ${wantStatus}`);
  }
  if (seen.text === upstreamError) {
    found.push("bare unavailability text");
  }
  if (/(?<![0-9])112(?![0-9])/u.test(probed)) {
    found.push("contains 112");
  }
  if (/sos/iu.test(probed)) {
    found.push("contains SOS");
  }
  if (cell.jev.kind === "offer" && (seen.text.includes(call3114Now) || /3114[^.]*maintenant/u.test(seen.text))) {
    found.push("offer turned urgent");
  }
  const hasSafety = seen.text.includes(emergencySafetySentence);
  const replaced = replacedBySafety(cell);
  const wantSafety = !emergency && (failed || replaced || cell.jev.kind === "no-triage");
  if (replaced && seen.status === 200 && seen.text !== emergencySafetySentence) {
    found.push("stripped reply is not exactly the safety sentence");
  }
  if (wantSafety && !hasSafety) {
    found.push("missing safety sentence");
  }
  if (!wantSafety && hasSafety) {
    found.push("unexpected safety sentence");
  }
  if (emergency && failed && !seen.text.endsWith(upstreamError)) {
    found.push("emergency 502 lost the unavailability text");
  }
  if (!ownsNumbers(cell)) {
    const numbers = expectedNumbers(cell);
    const checked = checkEmergencyReply(scoredText(seen.text), numbers);
    if (!checked.pass) {
      found.push(`checker ${checked.reason} found=[${checked.found.join(",")}] want=[${numbers.join(",")}]`);
    }
  }
  if (!sameCalls(seen.calls, cell.jev.calls)) {
    found.push(`calls ${JSON.stringify(seen.calls)}`);
  }
  return found;
}

function sameCalls(seen: unknown, want: Calls): boolean {
  if (want.length === 0) {
    return seen === undefined;
  }
  return JSON.stringify(seen) === JSON.stringify(want.map((number) => ({ type: "call", number })));
}

const cells: readonly Cell[] = jevOutcomes.flatMap((jev) =>
  modelOutcomes.map((model) => ({ jev, model })),
);

beforeEach(() => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", keyCanary);
  vi.stubEnv("JEV_API_KEY", keyCanary);
  vi.stubEnv("OPENROUTER_MODEL", "");
  resetTriageLog();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetTriageLog();
});

describe("every Jev outcome times every model outcome", () => {
  for (const cell of cells) {
    it(`${cell.jev.id} x ${cell.model.id}`, async () => {
      const seen = await observe(cell);
      expect(violations(cell, seen), JSON.stringify(seen)).toEqual([]);
    });
  }
});

it("covers 10 Jev outcomes and 11 model outcomes", () => {
  expect(jevOutcomes).toHaveLength(10);
  expect(modelOutcomes).toHaveLength(11);
  expect(cells).toHaveLength(110);
});

it("keeps the refusals-only and stripped-only columns apart", () => {
  expect(keptOutsideServices(refusalsOnly)).toBe(refusalsOnly);
  expect(keptOutsideServices(strippedOnly)).toBe("");
});

it("pins that the checker accepts no expectation for the safety sentence", () => {
  const shapes: readonly Calls[] = [[], ["15"], ["3114"], ["3114", "15"], ["15", "3114"]];
  for (const numbers of shapes) {
    const checked = checkEmergencyReply(emergencySafetySentence, numbers);
    expect(checked.pass, numbers.join(",")).toBe(false);
  }
  const bare = checkEmergencyReply(emergencySafetySentence, []);
  expect(bare.reason).toBe("numbers");
  expect(bare.found).toEqual(["15", "3114"]);
});

describe("mutation proof: the table reports a broken fallback", () => {
  const mutations: readonly {
    readonly name: string;
    readonly mutate: (cell: Cell, seen: Observed) => Observed;
  }[] = [
    {
      name: "safety sentence loses the 15",
      mutate: (_cell, seen) => ({
        ...seen,
        text: seen.text.replace(emergencySafetySentence, "Si tu as des idées suicidaires, appelle le 3114."),
      }),
    },
    {
      name: "502 falls back to the bare unavailability text",
      mutate: (_cell, seen) => (seen.status === 502 ? { ...seen, text: upstreamError } : seen),
    },
    {
      name: "emergency 502 drops the call opening",
      mutate: (cell, seen) =>
        cell.jev.kind === "emergency" && seen.status === 502
          ? { ...seen, text: `${emergencySafetySentence} ${upstreamError}` }
          : seen,
    },
    {
      name: "offer 502 says maintenant again",
      mutate: (cell, seen) =>
        cell.jev.kind === "offer" && seen.status === 502
          ? { ...seen, text: `${call3114Now} ${upstreamError}` }
          : seen,
    },
    {
      name: "a stripped-only reply becomes a 502",
      mutate: (cell, seen) =>
        replacedBySafety(cell) && seen.status === 200
          ? { ...seen, status: 502, text: `${emergencySafetySentence} ${upstreamError}` }
          : seen,
    },
    {
      name: "a stripped-only reply becomes empty",
      mutate: (cell, seen) => (replacedBySafety(cell) && seen.status === 200 ? { ...seen, text: "" } : seen),
    },
    {
      name: "a stripped-only reply loses its calls",
      mutate: (cell, seen) => (replacedBySafety(cell) && seen.status === 200 ? { ...seen, calls: undefined } : seen),
    },
    {
      name: "112 slips back into a reply",
      mutate: (_cell, seen) => (seen.status === 200 ? { ...seen, text: `${seen.text} Appelle le 112.` } : seen),
    },
  ];

  it("passes with no mutation", async () => {
    const failing = await failingCells((_cell, seen) => seen);
    expect(failing).toEqual([]);
  });

  for (const mutation of mutations) {
    it(`fails when ${mutation.name}`, async () => {
      const failing = await failingCells(mutation.mutate);
      expect(failing.length, mutation.name).toBeGreaterThan(0);
    });
  }
});

async function failingCells(
  mutate: (cell: Cell, seen: Observed) => Observed,
): Promise<string[]> {
  const failing: string[] = [];
  for (const cell of cells) {
    const seen = mutate(cell, await observe(cell));
    if (violations(cell, seen).length > 0) {
      failing.push(`${cell.jev.id} x ${cell.model.id}`);
    }
  }
  return failing;
}

async function observe(cell: Cell): Promise<Observed> {
  vi.stubEnv("JEV_API_KEY", cell.jev.respond === null ? "" : keyCanary);
  const respondJev = cell.jev.respond;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === JEV_URL) {
        if (respondJev === null) {
          throw new Error("Jev must not be called without a key");
        }
        return respondJev();
      }
      if (url === openRouterUrl) {
        return cell.model.respond();
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(userTurn),
    }),
  );
  const body: unknown = await response.json();
  const key = response.status === 200 ? "reply" : "error";
  const text = readField(body, key);
  return {
    status: response.status,
    text: typeof text === "string" ? text : "",
    calls: readField(body, "calls"),
  };
}

function readField(body: unknown, key: string): unknown {
  if (typeof body !== "object" || body === null || !Object.hasOwn(body, key)) {
    return undefined;
  }
  return Reflect.get(body, key);
}

function completion(content: string | null, finish?: string): Response {
  return Response.json({
    model: "openai/gpt-6.1-terra",
    choices: [
      {
        message: { content },
        ...(finish === undefined ? {} : { finish_reason: finish }),
      },
    ],
  });
}

const labelNames = ["emergency", "consult", "self-care", "need-info"] as const;
const channelNames = ["physical", "psychological", "both", "none"] as const;

function jevBody(
  label: (typeof labelNames)[number],
  labelP: number,
  channel: (typeof channelNames)[number],
  harm?: "yes" | "no",
): unknown {
  const answers: Record<string, unknown> = {
    label: choice(label, split(labelNames, label, labelP)),
    channel: choice(channel, split(channelNames, channel, 0.9)),
  };
  if (harm !== undefined) {
    answers["overdoseOrSelfHarm"] = choice(harm, split(["yes", "no"], harm, 0.9));
  }
  return { answers };
}

function choice(selected: string, probabilities: Record<string, number>): unknown {
  return { type: "choice", choice: selected, probabilities };
}

function split(
  options: readonly string[],
  selected: string,
  selectedP: number,
): Record<string, number> {
  const rest = (1 - selectedP) / (options.length - 1);
  const probabilities: Record<string, number> = {};
  for (const option of options) {
    probabilities[option] = option === selected ? selectedP : rest;
  }
  return probabilities;
}
