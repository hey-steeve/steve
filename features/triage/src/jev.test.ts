import { expect, expectTypeOf, it, vi } from "vitest";
import { classify } from "./jev.ts";
import {
  EMERGENCY_MIN_P,
  triageChannels,
  triageLabels,
  type CallAction,
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
        ]
      | readonly [
          { readonly type: "call"; readonly number: "3114" },
          { readonly type: "call"; readonly number: "15" },
        ];
  }>();
  expectTypeOf<CallAction>().toEqualTypeOf<{
    readonly type: "call";
    readonly number: EmergencyNumber;
  }>();
  expectTypeOf<Extract<ClassifyResult, { label: "consult" | "self-care" }>>().branded.toEqualTypeOf<{
    readonly label: "consult" | "self-care";
    readonly probability: number;
    readonly calls?: readonly [{ readonly type: "call"; readonly number: "3114" }];
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "model" | "below-threshold" }>>().branded.toEqualTypeOf<
    | {
        readonly label: "need-info";
        readonly reason: "model";
        readonly probability: number;
        readonly calls?: readonly [{ readonly type: "call"; readonly number: "3114" }];
      }
    | {
        readonly label: "need-info";
        readonly reason: "below-threshold";
        readonly probability: number;
        readonly calls?: readonly [{ readonly type: "call"; readonly number: "3114" }];
      }
  >();
  expectTypeOf<Extract<ClassifyResult, { reason: "timeout" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "timeout";
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "http" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "http";
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "network" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "network";
  }>();
  expectTypeOf<Extract<ClassifyResult, { reason: "malformed" }>>().branded.toEqualTypeOf<{
    readonly label: "need-info";
    readonly reason: "malformed";
  }>();
  type Failure = Extract<ClassifyResult, { reason: "timeout" | "http" | "network" | "malformed" }>;
  expectTypeOf<Failure["label"]>().toEqualTypeOf<"need-info">();
  expectTypeOf<Failure>().not.toHaveProperty("calls");
  expectTypeOf<Failure>().not.toHaveProperty("probability");
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
  const overdoseFirst = {
    label: "emergency",
    probability: EMERGENCY_MIN_P,
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  } satisfies ClassifyResult;
  expect(overdoseFirst.calls[0]).toEqual({ type: "call", number: "3114" });
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
  expectChoice(questions["overdoseOrSelfHarm"], ["yes", "no"]);
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

it("maps emergency channels to ordered 15 and 3114 calls", async () => {
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
  const psychologicalNo = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(
        bodyFor("emergency", 0.85, "psychological", 0.2, { overdoseOrSelfHarm: "no" }),
      ),
  });
  const physicalOverdose = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(bodyFor("emergency", 0.91, "physical", 0.2, { overdoseOrSelfHarm: "yes" })),
  });
  const distressOverdose = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(
        bodyFor("emergency", 0.89, "psychological", 0.2, { overdoseOrSelfHarm: "yes" }),
      ),
  });
  const bothRedFlag = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(bodyFor("emergency", 0.86, "both", 0.2, { overdoseOrSelfHarm: "no" })),
  });
  const bothOverdose = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(bodyFor("emergency", 0.87, "both", 0.2, { overdoseOrSelfHarm: "yes" })),
  });

  expect(physical).toEqual({
    label: "emergency",
    probability: 0.9,
    calls: [{ type: "call", number: "15" }],
  });
  expect(physicalOverdose).toEqual({
    label: "emergency",
    probability: 0.91,
    calls: [{ type: "call", number: "15" }],
  });
  expect(psychological).toEqual({
    label: "emergency",
    probability: 0.88,
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
  expect(psychologicalNo).toEqual({
    label: "emergency",
    probability: 0.85,
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
  expect(distressOverdose).toEqual({
    label: "emergency",
    probability: 0.89,
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
  expect(bothRedFlag).toEqual({
    label: "emergency",
    probability: 0.86,
    calls: [
      { type: "call", number: "15" },
      { type: "call", number: "3114" },
    ],
  });
  expect(bothOverdose).toEqual({
    label: "emergency",
    probability: 0.87,
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
});

it("does not guess call order when channel both has no overdose answer", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.9, "both")),
  });
  expect(result).toEqual({ label: "need-info", reason: "malformed" });
});

it("returns emergency when P(emergency) is at least 0.8 even if the choice is not emergency", async () => {
  for (const label of ["consult", "self-care", "need-info"] as const) {
    const result = await classify({
      state: demoState,
      timeoutMs: 50,
      fetch: async () =>
        Response.json(bodyFor(label, 0.1, "physical", 0.2, { emergencyP: EMERGENCY_MIN_P })),
    });
    expect(result).toEqual({
      label: "emergency",
      probability: EMERGENCY_MIN_P,
      calls: [{ type: "call", number: "15" }],
    });
  }
  const ordered = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(
        bodyFor("consult", 0.1, "both", 0.2, {
          emergencyP: 0.86,
          overdoseOrSelfHarm: "yes",
        }),
      ),
  });
  expect(ordered).toEqual({
    label: "emergency",
    probability: 0.86,
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
});

it("keeps no-channel when P(emergency) is at least 0.8 and the channel is none", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json(bodyFor("consult", 0.1, "none", 0.2, { emergencyP: 0.91 })),
  });
  expect(result).toEqual({
    label: "need-info",
    reason: "no-channel",
    probability: 0.91,
  });
  expect(result).not.toHaveProperty("calls");
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

it("offers 3114 when a non-emergency result has a psychological channel", async () => {
  const consult = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("consult", 0.66, "psychological")),
  });
  const selfCare = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("self-care", 0.64, "psychological")),
  });
  const needInfo = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("need-info", 0.62, "psychological")),
  });
  const both = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("consult", 0.61, "both")),
  });
  const below = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () => Response.json(bodyFor("emergency", 0.79, "psychological")),
  });

  expect(consult).toEqual({
    label: "consult",
    probability: 0.66,
    calls: [{ type: "call", number: "3114" }],
  });
  expect(selfCare).toEqual({
    label: "self-care",
    probability: 0.64,
    calls: [{ type: "call", number: "3114" }],
  });
  expect(needInfo).toEqual({
    label: "need-info",
    reason: "model",
    probability: 0.62,
    calls: [{ type: "call", number: "3114" }],
  });
  expect(both).toEqual({
    label: "consult",
    probability: 0.61,
    calls: [{ type: "call", number: "3114" }],
  });
  expect(below).toEqual({
    label: "need-info",
    reason: "below-threshold",
    probability: 0.79,
    calls: [{ type: "call", number: "3114" }],
  });
});

it("maps a timeout to need-info and never to emergency", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 20,
    fetch: (_input, init) => hangUntilAbort(init?.signal),
  });
  expect(result).toEqual({ label: "need-info", reason: "timeout" });
});

it("uses a 1500 ms timeout when the caller omits one", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    const result = await classify({
      state: demoState,
      fetch: async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    });
    expect(timeout).toHaveBeenCalledWith(1500);
    expect(result).toEqual({ label: "need-info", reason: "timeout" });
  } finally {
    timeout.mockRestore();
  }
});

it("maps an HTTP error, including 401, 402, 403, and 429, to need-info", async () => {
  for (const status of [401, 402, 403, 429, 500]) {
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

it("maps an out-of-range or negative probability to need-info", async () => {
  const above = withLabelProbability(bodyFor("consult", 0.7, "physical"), "emergency", 1.2);
  const negative = withLabelProbability(bodyFor("consult", 0.7, "physical"), "consult", -0.01);
  for (const payload of [above, negative]) {
    const result = await classify({
      state: demoState,
      timeoutMs: 50,
      fetch: async () => Response.json(payload),
    });
    expect(result).toEqual({ label: "need-info", reason: "malformed" });
  }
});

it("maps a missing channel to need-info", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 50,
    fetch: async () =>
      Response.json({
        answers: {
          label: choiceAnswer("consult", split(labelNames, "consult", 0.7), 0.2),
        },
      }),
  });
  expect(result).toEqual({ label: "need-info", reason: "malformed" });
});

it("maps a body that stalls after the headers to a timeout", async () => {
  const result = await classify({
    state: demoState,
    timeoutMs: 40,
    fetch: async () => stalledBody(),
  });
  expect(result).toEqual({ label: "need-info", reason: "timeout" });
}, 1000);

it("maps a body that rejects after the timeout to need-info when fetch ignores the signal", async () => {
  const rejections: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  let releaseBody: () => void = () => undefined;
  const bodyRejected = new Promise<void>((resolve) => {
    releaseBody = resolve;
  });
  let sawResult = false;
  let bodyFailedAfterResult = false;
  try {
    const timeoutMs = 30;
    const result = await classify({
      state: demoState,
      timeoutMs,
      fetch: () =>
        wait(timeoutMs + 25).then(
          () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  setTimeout(() => {
                    bodyFailedAfterResult = sawResult;
                    controller.error(new Error("body failed after abort"));
                    releaseBody();
                  }, 25);
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            ),
        ),
    });
    sawResult = true;
    await bodyRejected;
    await wait(50);
    expect(bodyFailedAfterResult).toBe(true);
    expect(result).toEqual({ label: "need-info", reason: "timeout" });
    expect(rejections).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}, 1000);

it("fail-closes when timeoutMs cannot be armed", async () => {
  for (const timeoutMs of [Number.NaN, -1, Number.MAX_SAFE_INTEGER, 2 ** 53]) {
    let called = false;
    const result = await classify({
      state: demoState,
      timeoutMs,
      fetch: async () => {
        called = true;
        return Response.json(bodyFor("emergency", 0.99, "physical"));
      },
    });
    expect(called).toBe(false);
    expect(result).toEqual({ label: "need-info", reason: "timeout" });
  }
});

it("does not reject a valid answer because confidence is unused", async () => {
  const high = bodyFor("consult", 0.7, "physical", 2);
  const text = bodyFor("consult", 0.7, "physical", 0.2);
  replaceConfidence(text, "high");
  const missing = bodyFor("consult", 0.7, "physical", 0.2);
  replaceConfidence(missing, undefined);
  for (const payload of [high, text, missing]) {
    const result = await classify({
      state: demoState,
      timeoutMs: 50,
      fetch: async () => Response.json(payload),
    });
    expect(result).toEqual({ label: "consult", probability: 0.7 });
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
  expect(result).toEqual({ label: "need-info", reason: "network" });
});

function bodyFor(
  label: (typeof labelNames)[number],
  labelP: number,
  channel: (typeof channelNames)[number],
  confidence = 0.2,
  extra?: {
    readonly emergencyP?: number;
    readonly overdoseOrSelfHarm?: "yes" | "no";
  },
): unknown {
  const labelProbabilities = split(labelNames, label, labelP);
  if (extra?.emergencyP !== undefined) {
    labelProbabilities["emergency"] = extra.emergencyP;
  }
  const answers: Record<string, unknown> = {
    label: choiceAnswer(label, labelProbabilities, confidence),
    channel: choiceAnswer(channel, split(channelNames, channel, 0.9), confidence),
  };
  if (extra?.overdoseOrSelfHarm !== undefined) {
    answers["overdoseOrSelfHarm"] = choiceAnswer(
      extra.overdoseOrSelfHarm,
      split(["yes", "no"], extra.overdoseOrSelfHarm, 0.9),
      confidence,
    );
  }
  return {
    model: "jev-1.14.0",
    answers,
    usage: { input_tokens: 12, output_tokens: 4 },
  };
}

function withLabelProbability(payload: unknown, option: string, probability: number): unknown {
  if (!isRecord(payload) || !isRecord(payload["answers"])) {
    return payload;
  }
  const answers = payload["answers"];
  const label = answers["label"];
  if (!isRecord(label) || !isRecord(label["probabilities"])) {
    return payload;
  }
  return {
    ...payload,
    answers: {
      ...answers,
      label: {
        ...label,
        probabilities: { ...label["probabilities"], [option]: probability },
      },
    },
  };
}

function replaceConfidence(payload: unknown, confidence: unknown): void {
  if (!isRecord(payload) || !isRecord(payload["answers"])) {
    return;
  }
  const answers = payload["answers"];
  for (const key of Object.keys(answers)) {
    const answer = answers[key];
    if (!isRecord(answer)) {
      continue;
    }
    if (confidence === undefined) {
      delete answer["confidence"];
      continue;
    }
    answer["confidence"] = confidence;
  }
}

function stalledBody(): Response {
  return new Response(
    new ReadableStream({
      start() {
        return undefined;
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
