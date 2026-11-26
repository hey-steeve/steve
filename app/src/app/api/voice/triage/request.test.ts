import { expect, it } from "vitest";
import { buildHandoff, readVoiceTriageRequest, type VoiceTurn, voiceTriageLimits } from "./request.js";

const cur = { sessionId: "s", turnId: "t2", channel: "voice", text: "J'ai mal" };
const prev = [
  { sessionId: "s", turnId: "t0", channel: "text", text: "Bonjour" },
  { sessionId: "s", turnId: "t1", channel: "voice", text: "Allô" },
];

function req(body: string, type = "application/json"): Request {
  return new Request("http://localhost/api/voice/triage", {
    method: "POST",
    headers: { "content-type": type },
    body,
  });
}

async function status(body: unknown): Promise<number | "ok"> {
  const result = await readVoiceTriageRequest(req(JSON.stringify(body)));
  return result.ok ? "ok" : result.status;
}

it("builds a handoff with previous in order and current last", async () => {
  const result = await readVoiceTriageRequest(req(JSON.stringify({ current: cur, previous: prev })));
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.handoff).toEqual({
    sessionId: "s",
    turnId: "t2",
    target: "triage",
    intent: "care_request",
    data: [...prev, cur],
  });
  expect(result.handoff.data.at(-1)?.channel).toBe("voice");
});

it("rejects a non-JSON content type with 415", async () => {
  const result = await readVoiceTriageRequest(req("x", "text/plain"));
  expect(result).toEqual({ ok: false, status: 415 });
});

it("rejects invalid payloads with 400", async () => {
  const bad: unknown[] = [
    { previous: [] },
    { current: cur },
    { current: { ...cur, channel: "text" }, previous: [] },
    { current: { ...cur, text: "" }, previous: [] },
    { current: { ...cur, extra: 1 }, previous: [] },
    { current: cur, previous: [], extra: 1 },
    { current: cur, previous: [{ ...prev[0], channel: "sms" }] },
    { current: cur, previous: [{ sessionId: "s", turnId: "x" }] },
    { current: cur, previous: [{ ...prev[0], sessionId: "other" }] },
    { current: cur, previous: "no" },
    { current: cur, previous: Array.from({ length: voiceTriageLimits.maxPrevious + 1 }, () => prev[0]) },
    { current: { ...cur, text: "a".repeat(voiceTriageLimits.maxTextChars + 1) }, previous: [] },
    [],
    null,
  ];
  for (const body of bad) {
    expect(await status(body)).toBe(400);
  }
  const notJson = await readVoiceTriageRequest(req("{nope"));
  expect(notJson).toEqual({ ok: false, status: 400 });
});

it("accepts the six patient turns triage reads", async () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ ...prev[0], turnId: `p${i}` }));
  expect(await status({ current: cur, previous: six })).toBe("ok");
});

it("rejects an over-size body with 413", async () => {
  const big = JSON.stringify({ current: cur, previous: [], pad: "a".repeat(voiceTriageLimits.maxBodyBytes) });
  expect(await readVoiceTriageRequest(req(big))).toEqual({ ok: false, status: 413 });
});

function streamReq(
  source: UnderlyingDefaultSource<Uint8Array>,
  headers: HeadersInit = { "content-type": "application/json" },
  strategy?: QueuingStrategy,
): Request {
  const init: RequestInit = {
    method: "POST",
    headers,
    body: new ReadableStream(source, strategy),
  };
  Object.assign(init, { duplex: "half" });
  return new Request("http://localhost/api/voice/triage", init);
}

it("maps a body read failure to 400", async () => {
  const request = streamReq({
    pull() {
      throw new Error("boom");
    },
  });
  expect(await readVoiceTriageRequest(request)).toEqual({ ok: false, status: 400 });
});

it("returns 413 for an over-size body even when cancel rejects", async () => {
  const request = streamReq({
    start(controller) {
      controller.enqueue(new Uint8Array(voiceTriageLimits.maxBodyBytes + 1));
    },
    cancel() {
      throw new Error("cancel-boom");
    },
  });
  expect(await readVoiceTriageRequest(request)).toEqual({ ok: false, status: 413 });
});

it("returns 413 from a declared Content-Length over the cap without reading the body", async () => {
  let pulled = false;
  const request = streamReq(
    {
      pull() {
        pulled = true;
        throw new Error("body must not be read");
      },
    },
    {
      "content-type": "application/json",
      "content-length": String(voiceTriageLimits.maxBodyBytes + 1),
    },
    { highWaterMark: 0 },
  );
  expect(request.headers.get("content-length")).toBe(String(voiceTriageLimits.maxBodyBytes + 1));
  expect(await readVoiceTriageRequest(request)).toEqual({ ok: false, status: 413 });
  expect(pulled).toBe(false);
});

it("omits older turns from the head of the handoff when the state exceeds 8000 characters", async () => {
  const turns = ["a", "b", "c", "d", "e", "f", "g"].map((letter, index): VoiceTurn => ({
    sessionId: "s",
    turnId: `t${index}`,
    channel: "voice",
    text: letter.repeat(2000),
  }));
  const result = await readVoiceTriageRequest(
    req(JSON.stringify({ current: turns[6], previous: turns.slice(0, 6) })),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.handoff.data).toEqual(turns.slice(4));
  const joined = result.handoff.data.map((turn) => turn.text).join("\n");
  expect(joined.length).toBe(6002);
  const current: VoiceTurn = { sessionId: "s", turnId: "t9", channel: "voice", text: "y".repeat(2000) };
  const tight = buildHandoff({ current, previous: [
    { sessionId: "s", turnId: "p0", channel: "voice", text: "z".repeat(3000) },
    { sessionId: "s", turnId: "p1", channel: "voice", text: "w".repeat(3000) },
  ] });
  expect(tight.data.length).toBe(2);
});

it("keeps a recorded emergency turn the 8000-character cap would drop", async () => {
  const mk = (id: string, letter: string): VoiceTurn => ({
    sessionId: "s",
    turnId: id,
    channel: "voice",
    text: letter.repeat(2000),
  });
  const previous = [mk("t0", "a"), mk("t1", "b"), mk("t2", "c"), mk("t3", "d"), mk("t4", "e"), mk("t5", "f")];
  const current = mk("t6", "g");
  const result = await readVoiceTriageRequest(
    req(JSON.stringify({ current, previous, decisions: [{ turnId: "t0", label: "emergency" }, { turnId: "t1", label: "consult" }] })),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  const ids = result.handoff.data.map((turn) => turn.turnId);
  expect(ids).toEqual(["t0", "t5", "t6"]);
  expect(result.handoff.data.at(-1)).toEqual(current);
  expect(result.handoff.data.slice(-6).map((turn) => turn.turnId)).toContain("t0");
});

it("fits six recorded emergencies plus current into 6 turns and 8000 characters", () => {
  const mk = (id: string, text = "x".repeat(2000)): VoiceTurn => ({ sessionId: "s", turnId: id, channel: "voice", text });
  const previous = ["e0", "e1", "e2", "e3", "e4", "e5"].map((id) => mk(id));
  const current = mk("c", "y".repeat(2000));
  const handoff = buildHandoff({
    current,
    previous,
    decisions: previous.map((t) => ({ turnId: t.turnId, label: "emergency" })),
  });
  const last6 = handoff.data.slice(-6);
  expect(handoff.data.length).toBeLessThanOrEqual(6);
  expect(last6.map((t) => t.text).join("\n").length).toBeLessThanOrEqual(voiceTriageLimits.maxStateChars);
  const ids = handoff.data.map((t) => t.turnId);
  expect(ids).toContain("e0");
  expect(ids).toContain("e5");
  expect(handoff.data.at(-1)).toEqual(current);
});

it("compacts a long recorded emergency to keep it with a whole current turn", () => {
  const mk = (id: string, text: string): VoiceTurn => ({ sessionId: "s", turnId: id, channel: "voice", text });
  const previous = [mk("e0", "a".repeat(2000)), mk("n1", "b".repeat(2000)), mk("n2", "c".repeat(2000)), mk("n3", "d".repeat(2000))];
  const current = mk("c", "y".repeat(2000));
  const handoff = buildHandoff({ current, previous, decisions: [{ turnId: "e0", label: "emergency" }] });
  const ids = handoff.data.map((t) => t.turnId);
  expect(ids).toEqual(["e0", "n3", "c"]);
  expect(handoff.data.at(-1)).toEqual(current);
  expect(handoff.data.map((t) => t.text).join("\n").length).toBeLessThanOrEqual(8000);
});

it("keeps five recorded emergencies instead of reserving a slot for an ordinary predecessor", () => {
  const mk = (id: string, text = "x".repeat(2000)): VoiceTurn => ({ sessionId: "s", turnId: id, channel: "voice", text });
  const emergencies = ["e0", "e1", "e2", "e3", "e4"].map((id) => mk(id));
  const current = mk("c", "y".repeat(2000));
  const handoff = buildHandoff({
    current,
    previous: [...emergencies, mk("n")],
    decisions: emergencies.map((t) => ({ turnId: t.turnId, label: "emergency" })),
  });
  const ids = handoff.data.map((t) => t.turnId);
  expect(ids).toEqual(["e0", "e1", "e2", "e3", "e4", "c"]);
  expect(handoff.data.length).toBeLessThanOrEqual(6);
  expect(handoff.data.map((t) => t.text).join("\n").length).toBeLessThanOrEqual(voiceTriageLimits.maxStateChars);
  expect(handoff.data.at(-1)).toEqual(current);
});

it("does not protect turns without a recorded label", () => {
  const mk = (id: string): VoiceTurn => ({ sessionId: "s", turnId: id, channel: "voice", text: "urgence ".repeat(250) });
  const handoff = buildHandoff({ current: mk("c"), previous: ["a", "b", "c0", "d"].map(mk) });
  expect(handoff.data.map((t) => t.turnId)).toEqual(["c0", "d", "c"]);
  expect(handoff.data.map((t) => t.turnId)).not.toContain("a");
});

it("parses a body with or without decisions and rejects bad decisions", async () => {
  expect(await status({ current: cur, previous: prev })).toBe("ok");
  expect(await status({ current: cur, previous: prev, decisions: [{ turnId: "t0", label: "emergency" }] })).toBe("ok");
  const bad: unknown[] = [
    "no",
    [{ turnId: "t0", label: "urgent" }],
    [{ turnId: "", label: "emergency" }],
    [{ turnId: "t0" }],
    [{ turnId: "t0", label: "emergency", extra: 1 }],
    Array.from({ length: voiceTriageLimits.maxPrevious + 1 }, () => ({ turnId: "t0", label: "consult" })),
  ];
  for (const decisions of bad) {
    expect(await status({ current: cur, previous: prev, decisions })).toBe(400);
  }
});
