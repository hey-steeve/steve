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

it("keeps an active call alive on a server error and preserves the error", () => {
  const state = run(speaking.concat(server({ type: "error", message: "x" })));
  expect(state.phase).toBe("active");
  expect(state.phase === "active" && state.lastError).toBe("x");
});

it("fails the call on a server error while connecting", () => {
  expect(run([{ type: "start" }, server({ type: "error", message: "x" })])).toEqual({
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

it("clears generation on done but keeps playback until it drains", () => {
  const done = run(speaking.concat(server({ type: "response.done", responseId: "r1" })));
  expect(done.phase === "active" && done.responseId).toBeUndefined();
  expect(done.phase === "active" && done.activity).toBe("speaking");
  const drained = reduceCall(done, { type: "playbackDrained" });
  expect(drained.phase === "active" && drained.playback).toBeUndefined();
  expect(drained.phase === "active" && drained.activity).toBe("listening");
});

it("barge-in after response.done still cancels with item and played offset", () => {
  const state = run(
    speaking.concat(
      server({ type: "response.done", responseId: "r1" }),
      server({ type: "input.speech_started", itemId: "u1" }),
    ),
  );
  expect(state.phase === "active" && state.cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 480,
  });
});

it("does not cancel after playback drained", () => {
  const state = run(
    speaking.concat(
      server({ type: "response.done", responseId: "r1" }),
      { type: "playbackDrained" },
      server({ type: "input.speech_started", itemId: "u1" }),
    ),
  );
  expect(state.phase === "active" && state.cancel).toBeUndefined();
});

it("ignores a stale delta from r1 once r2 is generating", () => {
  const state = run(
    speaking.concat(
      server({ type: "response.created", responseId: "r2" }),
      server({ type: "response.audio_delta", responseId: "r1", itemId: "i-stale", delta: "AA==" }),
    ),
  );
  expect(state.phase === "active" && state.playback?.itemId).toBe("i1");
  const paired = reduceCall(state, { type: "playbackStarted", responseId: "r2", itemId: "i2" });
  expect(paired.phase === "active" && paired.playback).toEqual({
    responseId: "r2",
    itemId: "i2",
    playedMs: 0,
  });
});

it("a stale done(r1) does not clear r2", () => {
  const state = run(
    speaking.concat(
      server({ type: "response.created", responseId: "r2" }),
      server({ type: "response.done", responseId: "r1" }),
    ),
  );
  expect(state.phase === "active" && state.responseId).toBe("r2");
  expect(state.phase === "active" && state.generating).toBe(true);
});

const binary: readonly CallEvent[] = [
  { type: "start" },
  { type: "connected" },
  server({ type: "response.created", responseId: "r1" }),
  { type: "playbackStarted", responseId: "r1", itemId: "i1" },
  { type: "playback", playedMs: 480 },
];

it("binary playback keeps barge-in after response.done", () => {
  const state = run(
    binary.concat(
      server({ type: "response.done", responseId: "r1" }),
      server({ type: "input.speech_started", itemId: "u1" }),
    ),
  );
  expect(state.phase === "active" && state.cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 480,
  });
});

it("truncates the audible item, not the next generating one", () => {
  const state = run(
    speaking.concat(
      server({ type: "response.created", responseId: "r2" }),
      server({ type: "response.audio_delta", responseId: "r2", itemId: "i2", delta: "AA==" }),
      { type: "playback", playedMs: 500 },
      server({ type: "input.speech_started", itemId: "u1" }),
    ),
  );
  expect(state.phase === "active" && state.cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 500,
    generatingResponseId: "r2",
  });
});

it("barge-in carries the generating response when it differs from the audible one", () => {
  const state = run(
    speaking.concat(
      server({ type: "response.created", responseId: "r2" }),
      server({ type: "input.speech_started", itemId: "u1" }),
    ),
  );
  expect(state.phase === "active" && state.cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 480,
    generatingResponseId: "r2",
  });
  expect(state.phase === "active" && state.generating).toBe(false);
  expect(state.phase === "active" && state.responseId).toBeUndefined();
});

it("a terminal event does not erase a pending barge-in", () => {
  for (const id of ["r1", "r0"]) {
    const state = run(
      speaking.concat(
        server({ type: "input.speech_started", itemId: "u1" }),
        server({ type: "response.done", responseId: id }),
      ),
    );
    expect(state.phase === "active" && state.cancel).toEqual({
      responseId: "r1",
      itemId: "i1",
      playedMs: 480,
    });
  }
  const acked = run(
    speaking.concat(
      server({ type: "input.speech_started", itemId: "u1" }),
      { type: "playbackDrained" },
    ),
  );
  expect(acked.phase === "active" && acked.cancel).toBeUndefined();
});
