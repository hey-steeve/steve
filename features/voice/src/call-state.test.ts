import { type CallEvent, type CallState, reduceCall } from "./index.ts";
import { expect, it } from "vitest";

const run = (events: readonly CallEvent[], from: CallState = { phase: "idle" }) =>
  events.reduce(reduceCall, from);

const server = (event: Extract<CallEvent, { type: "server" }>["event"]): CallEvent => ({
  type: "server",
  event,
});

const speaking: readonly CallEvent[] = [
  { type: "start" },
  { type: "connected" },
  server({ type: "response.created", responseId: "r1" }),
  server({ type: "response.audio_delta", responseId: "r1", itemId: "i1", delta: "AA==" }),
  { type: "playback", playedMs: 480 },
];

it("goes idle to connecting to active to ended", () => {
  expect(run([{ type: "start" }]).phase).toBe("connecting");
  expect(run([{ type: "start" }, { type: "connected" }]).phase).toBe("active");
  expect(
    run([{ type: "start" }, { type: "connected" }, { type: "end", reason: "hang-up" }]),
  ).toEqual({ phase: "ended", reason: "hang-up" });
});

it("ignores duplicate start and connected before start", () => {
  expect(run([{ type: "connected" }]).phase).toBe("idle");
  expect(run([{ type: "start" }, { type: "start" }]).phase).toBe("connecting");
  expect(run([{ type: "start" }, { type: "connected" }, { type: "start" }]).phase).toBe("active");
});

it("has mute only while active", () => {
  expect(run([{ type: "setMuted", muted: true }]).phase).toBe("idle");
  const connecting = run([{ type: "start" }, { type: "setMuted", muted: true }]);
  expect(connecting).toEqual({ phase: "connecting" });
  const active = run([{ type: "start" }, { type: "connected" }, { type: "setMuted", muted: true }]);
  expect(active.phase === "active" && active.muted).toBe(true);
  const ended = reduceCall(active, { type: "end", reason: "cap" });
  expect("muted" in ended).toBe(false);
});

it("ends from connecting and from active with any reason", () => {
  expect(run([{ type: "start" }, { type: "end", reason: "failed" }])).toEqual({
    phase: "ended",
    reason: "failed",
  });
  expect(run(speaking.concat({ type: "end", reason: "connection-lost" }))).toEqual({
    phase: "ended",
    reason: "connection-lost",
  });
});

it("ignores events once ended", () => {
  const ended: CallState = { phase: "ended", reason: "page-exit" };
  for (const event of [{ type: "start" }, { type: "connected" }, { type: "end", reason: "cap" }] as const) {
    expect(reduceCall(ended, event)).toBe(ended);
  }
  expect(reduceCall(ended, server({ type: "session.updated" }))).toBe(ended);
});

it("ends on a server error", () => {
  expect(run(speaking.concat(server({ type: "error", message: "x" })))).toEqual({
    phase: "ended",
    reason: "failed",
  });
});

it("marks playback cancelled on speech start while speaking", () => {
  const state = run(speaking.concat(server({ type: "input.speech_started", itemId: "u1" })));
  expect(state.phase === "active" && state.activity).toBe("listening");
  expect(state.phase === "active" && state.cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 480,
  });
  // A late delta from the cut response does not restart playback.
  const late = reduceCall(
    state,
    server({ type: "response.audio_delta", responseId: "r1", itemId: "i1", delta: "AA==" }),
  );
  expect(late).toBe(state);
});

it("does not need a response id when speech starts while listening", () => {
  const state = run([
    { type: "start" },
    { type: "connected" },
    server({ type: "input.speech_started", itemId: undefined }),
  ]);
  expect(state.phase === "active" && state.cancel).toBeUndefined();
  expect(state.phase === "active" && state.activity).toBe("listening");
});

it("clears the response on done", () => {
  const state = run(speaking.concat(server({ type: "response.done", responseId: "r1" })));
  expect(state.phase === "active" && state.responseId).toBeUndefined();
  expect(state.phase === "active" && state.activity).toBe("listening");
});
