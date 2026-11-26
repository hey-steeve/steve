import { type CallEvent, type CallState, initialCallState, parseServerEvent, reduceCall } from "./index.ts";
import { describe, expect, it } from "vitest";

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
  { type: "playback", playedMs: 480, generation: 0 },
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
  expect(reduceCall(ended, server({ type: "session.updated", sessionId: undefined, instructions: undefined }))).toBe(ended);
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
  const drained = reduceCall(done, { type: "playbackDrained", generation: 0 });
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
      { type: "playbackDrained", generation: 0 },
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
  const paired = reduceCall(state, { type: "playbackStarted", responseId: "r2", itemId: "i2", generation: 0 });
  expect(paired.phase === "active" && paired.playback).toEqual({
    responseId: "r2",
    itemId: "i2",
    playedMs: 0,
    generation: 0,
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
  { type: "playbackStarted", responseId: "r1", itemId: "i1", generation: 0 },
  { type: "playback", playedMs: 480, generation: 0 },
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
      { type: "playback", playedMs: 500, generation: 0 },
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
      { type: "playbackDrained", generation: 0 },
    ),
  );
  expect(acked.phase === "active" && acked.cancel).toBeUndefined();
});

const active = (s: CallState) => {
  if (s.phase !== "active") throw new Error("not active");
  return s;
};
const started = (responseId: string, itemId: string | undefined, generation: number): CallEvent => ({
  type: "playbackStarted",
  responseId,
  itemId,
  generation,
});

it("ignores a late playbackStarted for a response already marked cancelled", () => {
  const cut = run(speaking.concat(server({ type: "input.speech_started", itemId: "u1" })));
  expect(reduceCall(cut, started("r1", "i1", 0))).toBe(cut);
  const gen = run(
    speaking.concat(
      server({ type: "response.created", responseId: "r2" }),
      server({ type: "input.speech_started", itemId: "u1" }),
    ),
  );
  const g = active(gen).generation;
  expect(active(reduceCall(gen, started("r2", "i2", g))).playback).toBeUndefined();
});

it("a delayed playbackStarted(r1) after a flush does not replace newer r2", () => {
  const state = run(
    speaking.concat(
      server({ type: "input.speech_started", itemId: "u1" }),
      { type: "playbackDrained", generation: 0 },
      server({ type: "response.created", responseId: "r2" }),
      started("r2", "i2", 1),
      started("r1", "i1", 0),
    ),
  );
  expect(active(state).playback?.responseId).toBe("r2");
});

it("a delayed playbackDrained does not clear newer playback or its cancel", () => {
  const state = run(
    speaking.concat(
      server({ type: "input.speech_started", itemId: "u1" }),
      { type: "playbackDrained", generation: 0 },
      server({ type: "response.created", responseId: "r2" }),
      started("r2", "i2", 1),
      { type: "playbackDrained", generation: 0 },
    ),
  );
  expect(active(state).playback?.responseId).toBe("r2");
  const stalePlayback = reduceCall(state, { type: "playback", playedMs: 900, generation: 0 });
  expect(stalePlayback).toBe(state);
});

it("response.cancelled ends generation but keeps playback and pending cancel", () => {
  const playing = run(speaking.concat(server({ type: "response.cancelled", responseId: "r1" })));
  expect(active(playing).generating).toBe(false);
  expect(active(playing).playback?.itemId).toBe("i1");
  const cut = run(
    speaking.concat(
      server({ type: "input.speech_started", itemId: "u1" }),
      server({ type: "response.cancelled", responseId: "r1" }),
    ),
  );
  expect(active(cut).cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 480,
    generatingResponseId: undefined,
  });
});

it("a second speech_started keeps the first truncation and cancels the new generation", () => {
  const state = run(
    speaking.concat(
      server({ type: "input.speech_started", itemId: "u1" }),
      server({ type: "response.created", responseId: "r2" }),
      server({ type: "input.speech_started", itemId: "u2" }),
    ),
  );
  expect(active(state).cancel).toEqual({
    responseId: "r1",
    itemId: "i1",
    playedMs: 480,
    generatingResponseId: "r2",
  });
});

it("binary barge-in truncates the item announced by output_item.added", () => {
  const state = run([
    { type: "start" },
    { type: "connected" },
    server({ type: "response.created", responseId: "r1" }),
    server({ type: "response.output_item_added", responseId: "r1", itemId: "i1" }),
    started("r1", undefined, 0),
    { type: "playback", playedMs: 480, generation: 0 },
    server({ type: "input.speech_started", itemId: "u1" }),
  ]);
  expect(active(state).cancel).toMatchObject({ responseId: "r1", itemId: "i1", playedMs: 480 });
});

// BC-45: a missing or stale response or item id is never a wildcard for the
// current response.
describe("BC-45 missing response or item id is not a wildcard", () => {
  // r1 played and drained, then done. r2 is generating with item i2.
  const r2Generating = run([
    { type: "start" },
    { type: "connected" },
    server({ type: "response.created", responseId: "r1" }),
    server({ type: "response.output_item_added", responseId: "r1", itemId: "i1" }),
    server({ type: "response.audio_delta", responseId: "r1", itemId: "i1", delta: "AA==" }),
    { type: "playbackDrained", generation: 0 },
    server({ type: "response.done", responseId: "r1" }),
    server({ type: "response.created", responseId: "r2" }),
    server({ type: "response.output_item_added", responseId: "r2", itemId: "i2" }),
  ]);

  const unchanged: readonly (readonly [string, Parameters<typeof server>[0]])[] = [
    [
      "audio_delta without response_id (old item i1)",
      { type: "response.audio_delta", responseId: undefined, itemId: "i1", delta: "AA==" },
    ],
    [
      "audio_delta without response_id or item_id",
      { type: "response.audio_delta", responseId: undefined, itemId: undefined, delta: "AA==" },
    ],
    [
      "audio_delta with stale response_id",
      { type: "response.audio_delta", responseId: "r1", itemId: "i1", delta: "AA==" },
    ],
    [
      "audio_delta for current response with stale item_id",
      { type: "response.audio_delta", responseId: "r2", itemId: "i1", delta: "AA==" },
    ],
    ["response.done with stale response_id", { type: "response.done", responseId: "r1" }],
    ["response.cancelled with stale response_id", { type: "response.cancelled", responseId: "r1" }],
    [
      "output_item_added with stale response_id",
      { type: "response.output_item_added", responseId: "r1", itemId: "i9" },
    ],
    [
      "transcription_updated without item_id",
      { type: "input.transcription_updated", itemId: undefined, text: "bon" },
    ],
    [
      "transcription_completed without item_id",
      { type: "input.transcription_completed", itemId: undefined, text: "bonjour" },
    ],
    ["speech_stopped without item_id", { type: "input.speech_stopped", itemId: undefined }],
  ];

  it.each(unchanged)("leaves state untouched: %s", (_name, event) => {
    expect(reduceCall(r2Generating, server(event))).toEqual(r2Generating);
  });

  it("does not start playback as r2/i1 from an id-less delta (repro)", () => {
    // r2 has announced no item, so only the response_id check can reject this.
    // It fails if a missing response_id is treated as "current".
    const r2NoItem = run([
      { type: "start" },
      { type: "connected" },
      server({ type: "response.created", responseId: "r1" }),
      server({ type: "response.audio_delta", responseId: "r1", itemId: "i1", delta: "AA==" }),
      { type: "playbackDrained", generation: 0 },
      server({ type: "response.done", responseId: "r1" }),
      server({ type: "response.created", responseId: "r2" }),
    ]);
    const next = reduceCall(
      r2NoItem,
      server({ type: "response.audio_delta", responseId: undefined, itemId: "i1", delta: "AA==" }),
    );
    expect(next).toEqual(r2NoItem);
    expect(next.phase === "active" && next.playback).toBeUndefined();
  });

  it("keeps r2 generating after stale done and cancelled", () => {
    for (const type of ["response.done", "response.cancelled"] as const) {
      const next = reduceCall(r2Generating, server({ type, responseId: "r1" }));
      expect(next.phase === "active" && next.generating).toBe(true);
      expect(next.phase === "active" && next.responseId).toBe("r2");
    }
  });

  it("falls back to the announced item only for the exact current response", () => {
    const next = reduceCall(
      r2Generating,
      server({ type: "response.audio_delta", responseId: "r2", itemId: undefined, delta: "AA==" }),
    );
    expect(next.phase === "active" && next.playback?.responseId).toBe("r2");
    expect(next.phase === "active" && next.playback?.itemId).toBe("i2");
  });

  it("barge-in target does not depend on a speech item_id", () => {
    const withId = reduceCall(r2Generating, server({ type: "input.speech_started", itemId: "x" }));
    const without = reduceCall(
      r2Generating,
      server({ type: "input.speech_started", itemId: undefined }),
    );
    expect(without).toEqual(withId);
  });
});

// BC-46: repeat playback or delta omits a known item id and drops state.
describe("BC-46 repeat playback or delta omits a known item id and drops state", () => {
  const r2Playing = run([
    { type: "start" },
    { type: "connected" },
    server({ type: "response.created", responseId: "r2" }),
    started("r2", "i1", 0),
    { type: "playback", playedMs: 480, generation: 0 },
  ]);
  // Binary playback that started before any item id was known.
  const noItem = run([
    { type: "start" },
    { type: "connected" },
    server({ type: "response.created", responseId: "r2" }),
    started("r2", undefined, 0),
    { type: "playback", playedMs: 480, generation: 0 },
  ]);

  const cases: readonly (readonly [string, CallState, CallEvent, string | undefined, number])[] = [
    ["repeat playbackStarted without item id keeps item and offset", r2Playing, started("r2", undefined, 0), "i1", 480],
    ["repeat playbackStarted with matching item id keeps offset", r2Playing, started("r2", "i1", 0), "i1", 480],
    [
      "later audio_delta fills a missing item id and keeps offset",
      noItem,
      server({ type: "response.audio_delta", responseId: "r2", itemId: "i1", delta: "AA==" }),
      "i1",
      480,
    ],
    [
      "later audio_delta does not overwrite a known item id",
      r2Playing,
      server({ type: "response.audio_delta", responseId: "r2", itemId: "i9", delta: "AA==" }),
      "i1",
      480,
    ],
    [
      "output_item.added still fills a missing item id and keeps offset",
      noItem,
      server({ type: "response.output_item_added", responseId: "r2", itemId: "i1" }),
      "i1",
      480,
    ],
    [
      "audio_delta of another response does not fill the item id",
      noItem,
      server({ type: "response.audio_delta", responseId: "r1", itemId: "i1", delta: "AA==" }),
      undefined,
      480,
    ],
    [
      "audio_delta without response id does not fill the item id",
      noItem,
      server({ type: "response.audio_delta", responseId: undefined, itemId: "i1", delta: "AA==" }),
      undefined,
      480,
    ],
  ];

  it.each(cases)("%s", (_name, from, event, itemId, playedMs) => {
    const playback = active(reduceCall(from, event)).playback;
    expect(playback?.responseId).toBe("r2");
    expect(playback?.itemId).toBe(itemId);
    expect(playback?.playedMs).toBe(playedMs);
  });

  it("a different known item id still switches item and resets the offset", () => {
    const playback = active(reduceCall(r2Playing, started("r2", "i2", 0))).playback;
    expect(playback).toMatchObject({ responseId: "r2", itemId: "i2", playedMs: 0 });
  });

  it("repeat playbackStarted falls back to generatingItemId when playback has no item", () => {
    const state = run([
      { type: "start" },
      { type: "connected" },
      server({ type: "response.created", responseId: "r2" }),
      started("r2", undefined, 0),
      { type: "playback", playedMs: 480, generation: 0 },
      server({ type: "response.output_item_added", responseId: "r2", itemId: "i1" }),
      started("r2", undefined, 0),
    ]);
    expect(active(state).playback).toMatchObject({ itemId: "i1", playedMs: 480 });
  });

  // Guard proof: a reducer that cleared the item and reset the offset on an
  // id-less repeat would produce `regressed`. The same assertions must reject it.
  it("guard fails when a repeat playbackStarted without item id clears item and offset", () => {
    const after = active(reduceCall(r2Playing, started("r2", undefined, 0))).playback;
    const regressed = { ...after, itemId: undefined, playedMs: 0 };
    const guard = (p: { itemId?: string | undefined; playedMs?: number } | undefined) => {
      expect(p?.itemId).toBe("i1");
      expect(p?.playedMs).toBe(480);
    };
    expect(() => guard(regressed)).toThrow();
    expect(() => guard(after)).not.toThrow();
  });
});

// Regression table: every case from blast-radius round 1 and Roman's PR 60
// round 1 repros. Config nesting stays in config.test.ts ("nests language and
// keyterms under audio.input.transcription with the model", "pins model, voice,
// language and server VAD"). A failure here is a regression.
describe("PR 60 regression table", () => {
  const speechStarted = server({ type: "input.speech_started", itemId: "u1" });
  const cancelOf = (events: readonly CallEvent[]) => active(run(events)).cancel;

  const cases: readonly (readonly [string, () => unknown, unknown])[] = [
    [
      "binary barge-in after response.done",
      () => cancelOf(binary.concat(server({ type: "response.done", responseId: "r1" }), speechStarted)),
      { responseId: "r1", itemId: "i1", playedMs: 480 },
    ],
    [
      "audible r1 with generating r2 truncates r1 and keeps generatingResponseId",
      () =>
        cancelOf(
          speaking.concat(
            server({ type: "response.created", responseId: "r2" }),
            server({ type: "response.audio_delta", responseId: "r2", itemId: "i2", delta: "AA==" }),
            { type: "playback", playedMs: 500, generation: 0 },
            speechStarted,
          ),
        ),
      { responseId: "r1", itemId: "i1", playedMs: 500, generatingResponseId: "r2" },
    ],
    [
      "matching done after barge-in keeps the pending cut",
      () => cancelOf(speaking.concat(speechStarted, server({ type: "response.done", responseId: "r1" }))),
      { responseId: "r1", itemId: "i1", playedMs: 480 },
    ],
    [
      "stale done after barge-in keeps the pending cut",
      () => cancelOf(speaking.concat(speechStarted, server({ type: "response.done", responseId: "r0" }))),
      { responseId: "r1", itemId: "i1", playedMs: 480 },
    ],
    [
      "JSON delta, 480 ms, done, speech_started truncates i1 at 480",
      () => cancelOf(speaking.concat(server({ type: "response.done", responseId: "r1" }), speechStarted)),
      { responseId: "r1", itemId: "i1", playedMs: 480 },
    ],
    [
      "stale server ids: delta r1 after r2 created keeps playback item i1",
      () =>
        active(
          run(
            speaking.concat(
              server({ type: "response.created", responseId: "r2" }),
              server({ type: "response.audio_delta", responseId: "r1", itemId: "i-stale", delta: "AA==" }),
            ),
          ),
        ).playback?.itemId,
      "i1",
    ],
    [
      "stale server ids: done r1 does not clear generating r2",
      () => {
        const s = active(
          run(
            speaking.concat(
              server({ type: "response.created", responseId: "r2" }),
              server({ type: "response.done", responseId: "r1" }),
            ),
          ),
        );
        return [s.responseId, s.generating];
      },
      ["r2", true],
    ],
    [
      "recoverable error on an active call keeps it active and records the error",
      () => {
        const s = run(speaking.concat(server({ type: "error", message: "x" })));
        return [s.phase, s.phase === "active" && s.lastError];
      },
      ["active", "x"],
    ],
    [
      "error while connecting still fails the call",
      () => run([{ type: "start" }, server({ type: "error", message: "x" })]),
      { phase: "ended", reason: "failed" },
    ],
    [
      "malformed session.created is rejected by the parser",
      () =>
        [
          { type: "session.created" },
          { type: "session.created", session: null },
          { type: "session.created", session: "s1" },
        ].map(parseServerEvent),
      [undefined, undefined, undefined],
    ],
    [
      "malformed response.done (missing completion id) is rejected by the parser",
      () =>
        [
          { type: "response.done" },
          { type: "response.done", response: {} },
          { type: "response.done", response: { id: "" } },
          { type: "response.done", response: 7 },
        ].map(parseServerEvent),
      [undefined, undefined, undefined, undefined],
    ],
    [
      "response.cancelled without id is rejected by the parser",
      () => parseServerEvent({ type: "response.cancelled" }),
      undefined,
    ],
    [
      "response.cancelled keeps a pending cut",
      () =>
        cancelOf(speaking.concat(speechStarted, server({ type: "response.cancelled", responseId: "r1" }))),
      { responseId: "r1", itemId: "i1", playedMs: 480, generatingResponseId: undefined },
    ],
    [
      "a second speech_started keeps the first truncation and cancels the new generation",
      () =>
        cancelOf(
          speaking.concat(
            speechStarted,
            server({ type: "response.created", responseId: "r2" }),
            server({ type: "input.speech_started", itemId: "u2" }),
          ),
        ),
      { responseId: "r1", itemId: "i1", playedMs: 480, generatingResponseId: "r2" },
    ],
    [
      "late playbackStarted of a cut id is ignored",
      () => {
        const cut = run(speaking.concat(speechStarted));
        return reduceCall(cut, started("r1", "i1", 0)) === cut;
      },
      true,
    ],
    [
      "late playbackStarted of a cut id is ignored at the current generation",
      () => {
        const cut = run(speaking.concat(speechStarted));
        return reduceCall(cut, started("r1", "i1", active(cut).generation)) === cut;
      },
      true,
    ],
  ];

  it.each(cases)("%s", (_name, actual, expected) => {
    expect(actual()).toEqual(expected);
  });
});

describe("generationRetired", () => {
  it("bumps generation and drops playback without a cancel", () => {
    let s = reduceCall(reduceCall(initialCallState, { type: "start" }), { type: "connected" });
    s = reduceCall(s, { type: "playbackStarted", responseId: "r", itemId: "i", generation: 0 });
    s = reduceCall(s, { type: "generationRetired" });
    expect(s).toMatchObject({ generation: 1, playback: undefined, cancel: undefined, activity: "listening" });
  });
});
