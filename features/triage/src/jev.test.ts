import { expect, expectTypeOf, it, vi } from "vitest";
import { classify } from "./jev.ts";
import {
  EMERGENCY_MIN_P,
  triageChannels,
  triageLabels,
  type ClassifyResult,
  type EmergencyNumber,
  type TriageChannel,
  type TriageLabel,
} from "./types.ts";

const demoState = "Message de démonstration, sans symptôme.";

const labelNames = ["emergency", "consult", "self-care", "need-info"] as const;
const channelNames = ["physical", "psychological", "both", "none"] as const;

it("names the four labels, the two emergency numbers, and the probability gate", () => {
  expect([...triageLabels]).toEqual([...labelNames]);
  expectTypeOf<TriageLabel>().toEqualTypeOf<"emergency" | "consult" | "self-care" | "need-info">();
  expectTypeOf<"watch">().not.toMatchTypeOf<TriageLabel>();
  expectTypeOf<EmergencyNumber>().toEqualTypeOf<"15" | "3114">();
  expectTypeOf<"112">().not.toMatchTypeOf<EmergencyNumber>();
  expectTypeOf<"15">().toMatchTypeOf<EmergencyNumber>();
  expectTypeOf<"3114">().toMatchTypeOf<EmergencyNumber>();
  expect(EMERGENCY_MIN_P).toBe(0.8);
  expectTypeOf<typeof EMERGENCY_MIN_P>().toEqualTypeOf<0.8>();
  expect([...triageChannels]).toEqual([...channelNames]);
  expectTypeOf<TriageChannel>().toEqualTypeOf<"physical" | "psychological" | "both" | "none">();
});

it("types an emergency result as call actions and keeps failures off 15 and 3114", () => {
  expectTypeOf<Extract<ClassifyResult, { label: "emergency" }>>().branded.toEqualTypeOf<{
    readonly label: "emergency";
    readonly probability: number;
    readonly calls:
      | readonly [{ readonly type: "call"; readonly number: "15" }]
      | readonly [{ readonly type: "call"; readonly number: "3114" }]
      | readonly [
          { readonly type: "call"; readonly number: "15" },
          { readonly type: "call"; readonly number: "3114" },
        ];
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "timeout" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "timeout";
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "http" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "http";
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "malformed" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "malformed";
  }>();
  type Failure = Extract<ClassifyResult, { reason: "timeout" | "http" | "malformed" }>;
  expectTypeOf<Failure["label"]>().toEqualTypeOf<"need-info">();
  expectTypeOf<Failure>().not.toHaveProperty("calls");
  expectTypeOf<Failure>().not.toHaveProperty("probability");
  expectTypeOf<Extract<ClassifyResult, { reason: "below-threshold" }>>().not.toHaveProperty(
    "calls",
  );
  expectTypeOf<Extract<ClassifyResult, { reason: "no-channel" }>>().not.toHaveProperty("calls");
  expectTypeOf<{ readonly label: "emergency"; readonly reason: "timeout" }>().not.toMatchTypeOf<
    ClassifyResult
  >();
  const emergency = {
    label: "emergency",
    probability: EMERGENCY_MIN_P,
    calls: [{ type: "call", number: "15" }],
  } satisfies ClassifyResult;
  expect(emergency.calls[0]).toEqual({ type: "call", number: "15" });
});

it("posts one System One request and classifies a valid emergency body", async () => {
  const seen: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const result = await classify({
    state: demoState,
    fetch: async (input, init) => {
      seen.push({ input, init });
      return Response.json(bodyFor("emergency", 0.91, "physical"));
    },
  });

  expect(seen).toHaveLength(1);
  const posted = seen[0];
  expect(posted).toBeDefined();
  if (posted === undefined) {
    return;
  }
  expect(String(posted.input)).toBe("https://api.typesafe.ai/v1/systemone");
  expect(posted.init?.method).toBe("POST");
  expect(posted.init?.headers).toEqual({ "content-type": "application/json" });
  expect(JSON.stringify(posted.init?.headers).toLowerCase()).not.toContain("authorization");
  expect(posted.init?.signal).toBeInstanceOf(AbortSignal);
  const body = jsonBody(posted.init);
  expect(isRecord(body)).toBe(true);
  if (!isRecord(body)) {
    return;
  }
  expect(body["model"]).toBe("jev-1.14.0");
  expect(body["state"]).toBe(demoState);
  const questions = body["questions"];
  expect(isRecord(questions)).toBe(true);
  if (!isRecord(questions)) {
    return;
  }
  expectChoice(questions["label"], labelNames);
  expectChoice(questions["channel"], channelNames);
  expect(result).toEqual({
    label: "emergency",
    probability: 0.91,
    calls: [{ type: "call", number: "15" }],
  });
});

it("sends the caller model when one is provided", async () => {
  let model = "";
  await classify({
    state: demoState,
    model: "jev-test",
    timeoutMs: 50,
    fetch: async (_input, init) => {
      const body = jsonBody(init);
      if (isRecord(body) && typeof body["model"] === "string") {
        model = body["model"];
      }
      return Response.json(bodyFor("consult", 0.7, "none"));
    },
  });
  expect(model).toBe("jev-test");
});

it("maps emergency channels to 15, 3114, or both numbers", async () => {
  const physical = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.9, "physical")),
  });
  const psychological = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.88, "psychological")),
  });
  const both = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.86, "both")),
  });

  expect(physical).toEqual({
    label: "emergency",
    probability: 0.9,
    calls: [{ type: "call", number: "15" }],
  });
  expect(psychological).toEqual({
    label: "emergency",
    probability: 0.88,
    calls: [{ type: "call", number: "3114" }],
  });
  expect(both).toEqual({
    label: "emergency",
    probability: 0.86,
    calls: [
      { type: "call", number: "15" },
      { type: "call", number: "3114" },
    ],
  });
});

it("returns emergency at the probability gate", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", EMERGENCY_MIN_P, "physical")),
  });
  expect(result).toEqual({
    label: "emergency",
    probability: EMERGENCY_MIN_P,
    calls: [{ type: "call", number: "15" }],
  });
});

it("demotes emergency below the gate to need-info with no call", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.79, "physical", 0.99)),
  });
  expect(result).toEqual({
    label: "need-info",
    reason: "below-threshold",
    probability: 0.79,
  });
  expect(result).not.toHaveProperty("calls");
});

it("demotes emergency with channel none to need-info with no call", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.97, "none")),
  });
  expect(result).toEqual({
    label: "need-info",
    reason: "no-channel",
    probability: 0.97,
  });
  expect(result).not.toHaveProperty("calls");
});

it("returns consult, self-care, and model need-info without a call", async () => {
  const consult = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("consult", 0.66, "physical")),
  });
  const selfCare = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("self-care", 0.64, "physical")),
  });
  const needInfo = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("need-info", 0.62, "none")),
  });

  expect(consult).toEqual({ label: "consult", probability: 0.66 });
  expect(selfCare).toEqual({ label: "self-care", probability: 0.64 });
  expect(needInfo).toEqual({ label: "need-info", reason: "model", probability: 0.62 });
  expect(consult).not.toHaveProperty("calls");
  expect(selfCare).not.toHaveProperty("calls");
  expect(needInfo).not.toHaveProperty("calls");
});

it("maps a timeout to need-info and never to emergency", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 20,
    fetch: (_input, init) => hangUntilAbort(init?.signal),
  });
  expect(result).toEqual({ label: "need-info", reason: "timeout" });
});

it("uses an 800 ms timeout when the caller omits one", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    const result = await classify({
      state: demoState,
      fetch: async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    });
    expect(timeout).toHaveBeenCalledWith(800);
    expect(result).toEqual({ label: "need-info", reason: "timeout" });
  } finally {
    timeout.mockRestore();
  }
});

it("maps an HTTP error, including 402 and 429, to need-info", async () => {
  for (const status of [402, 429, 500]) {
    const result = await classify({
      state: demoState,
      timeoutMs: 50,
      fetch: async () => Response.json(bodyFor("emergency", 0.99, "physical"), { status }),
    });
    expect(result).toEqual({ label: "need-info", reason: "http" });
  }
});

it("maps a malformed body to need-info", async () => {
  const payloads = [
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ answers: [] }),
    JSON.stringify({
      answers: {
        label: { type: "choice", choice: "emergency", confidence: "high" },
      },
    }),
    JSON.stringify({
      answers: {
        label: {
          type: "noul",
          choice: "emergency",
          confidence: 1,
          probabilities: split(labelNames, "emergency", 1),
        },
        channel: choiceAnswer("physical", split(channelNames, "physical", 1), 1),
      },
    }),
  ];
  for (const payload of payloads) {
    const result = await classify({
      state: demoState,
      timeoutMs: 50,
      fetch: async () => new Response(payload, { status: 200 }),
    });
    expect(result).toEqual({ label: "need-info", reason: "malformed" });
  }
});

it("maps a thrown fetch failure to need-info", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => {
      throw new TypeError("network down");
    },
  });
  expect(result).toEqual({ label: "need-info", reason: "http" });
});

function bodyFor(
  label: (typeof labelNames)[number],
  labelP: number,
  channel: (typeof channelNames)[number],
  confidence = 0.2,
): unknown {
  return {
    model: "jev-1.14.0",
    answers: {
      label: choiceAnswer(label, split(labelNames, label, labelP), confidence),
      channel: choiceAnswer(channel, split(channelNames, channel, 0.9), confidence),
    },
    usage: { input_tokens: 12, output_tokens: 4 },
  };
}

function choiceAnswer(
  choice: string,
  probabilities: Record<string, number>,
  confidence: number,
): unknown {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities,
  };
}

function split(
  options: readonly string[],
  selected: string,
  selectedP: number,
): Record<string, number> {
  const others = options.length - 1;
  const rest = others === 0 ? 0 : (1 - selectedP) / others;
  const probabilities: Record<string, number> = {};
  for (const option of options) {
    probabilities[option] = option === selected ? selectedP : rest;
  }
  return probabilities;
}

function hangUntilAbort(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    void _resolve;
    if (signal === undefined || signal === null) {
      reject(new Error("missing signal"));
      return;
    }
    const fail = () => {
      reject(signal.reason);
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });
}

function jsonBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    return undefined;
  }
  return JSON.parse(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectChoice(value: unknown, options: readonly string[]): void {
  expect(isRecord(value)).toBe(true);
  if (!isRecord(value)) {
    return;
  }
  expect(value["type"]).toBe("choice");
  expect(typeof value["instructions"]).toBe("string");
  if (typeof value["instructions"] === "string") {
    expect(value["instructions"].length).toBeGreaterThan(0);
  }
  const criteria = value["criteria"];
  expect(isRecord(criteria)).toBe(true);
  if (!isRecord(criteria)) {
    return;
  }
  expect(Object.keys(criteria).sort()).toEqual([...options].sort());
  for (const option of options) {
    expect(typeof criteria[option]).toBe("string");
    if (typeof criteria[option] === "string") {
      expect(criteria[option].length).toBeGreaterThan(0);
    }
  }
}
