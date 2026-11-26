import { expect, it } from "vitest";
import { readVoiceTriageRequest, voiceTriageLimits } from "./request.js";

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
