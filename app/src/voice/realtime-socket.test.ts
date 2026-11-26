import { describe, expect, it, vi } from "vitest";
import {
  VOICE_MODEL,
  buildSessionConfig,
  initialCallState,
  reduceCall,
  type ServerEvent,
  type VoiceTuning,
} from "@steve/voice";
import {
  REALTIME_URL,
  SERVER_ERROR_MESSAGE,
  SUBPROTOCOL_PREFIX,
  connectRealtime,
  fromBase64,
  toBase64,
  type InboundAudio,
  type SocketHandlers,
  type SocketLike,
} from "./realtime-socket";
import { mockSecretValue } from "./mock-session";

const TOKEN = "test-token-value";
const json: VoiceTuning = {
  reasoningEffort: "none",
  codec: "pcm16-24k",
  transport: "json",
};
const binary: VoiceTuning = { ...json, transport: "binary" };

class FakeSocket implements SocketLike {
  readyState = 0;
  readonly sent: (string | Uint8Array)[] = [];
  closeCalls = 0;
  throwOnClose = false;
  readonly url: string;
  readonly protocols: readonly string[];
  readonly handlers: SocketHandlers;
  constructor(
    url: string,
    protocols: readonly string[],
    handlers: SocketHandlers,
  ) {
    this.url = url;
    this.protocols = protocols;
    this.handlers = handlers;
  }
  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {
    this.closeCalls += 1;
    if (this.throwOnClose) throw new Error("closed");
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.handlers.open();
  }
  receive(data: unknown): void {
    this.handlers.message(data);
  }
}

function first(sockets: readonly FakeSocket[]): FakeSocket {
  const s = sockets[0];
  if (s === undefined) throw new Error("no socket");
  return s;
}

function sentText(s: FakeSocket, index: number): string {
  const v = s.sent[index];
  if (typeof v !== "string") throw new Error("expected text frame");
  return v;
}

function setup(tuning: VoiceTuning, token = TOKEN) {
  const sockets: FakeSocket[] = [];
  const events: ServerEvent[] = [];
  const audio: InboundAudio[] = [];
  const handle = connectRealtime({
    token,
    instructions: "instr",
    keyterms: ["alan"],
    tuning,
    onEvent: (e) => events.push(e),
    onAudio: (a) => audio.push(a),
    createSocket: (url, protocols, handlers) => {
      const s = new FakeSocket(url, protocols, handlers);
      sockets.push(s);
      return s;
    },
  });
  return { handle, sockets, events, audio, socket: () => first(sockets) };
}

const delta = (bytes: Uint8Array) =>
  JSON.stringify({
    type: "response.output_audio.delta",
    response_id: "r1",
    item_id: "i1",
    delta: toBase64(bytes),
  });

describe("handshake", () => {
  it("opens the xAI URL with the client-secret subprotocol and sends one session.update", () => {
    const { socket } = setup(json);
    const s = socket();
    expect(s.url === REALTIME_URL).toBe(true);
    expect(s.url).toBe(`wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`);
    expect(s.protocols).toHaveLength(1);
    expect(s.protocols[0]?.startsWith(SUBPROTOCOL_PREFIX)).toBe(true);
    expect(s.protocols[0] === `${SUBPROTOCOL_PREFIX}${TOKEN}`).toBe(true);
    expect(s.sent).toHaveLength(0);
    s.open();
    expect(s.sent).toHaveLength(1);
    expect(JSON.parse(sentText(s, 0))).toEqual({
      type: "session.update",
      session: buildSessionConfig({
        instructions: "instr",
        keyterms: ["alan"],
        tuning: json,
      }),
    });
  });

  it("does not open a real socket for the mock token", () => {
    const factory = vi.fn();
    const handle = connectRealtime({
      token: mockSecretValue,
      instructions: "",
      keyterms: [],
      tuning: json,
      onEvent: () => undefined,
      onAudio: () => undefined,
      createSocket: factory,
    });
    expect(factory.mock.calls.length === 0).toBe(true);
    expect(handle.mock).toBe(true);
    handle.sendAudio(new Uint8Array(2));
    handle.close();
  });
});

describe("json transport", () => {
  it("sends mic audio as base64 append and hands deltas to playback", () => {
    const { handle, socket, events, audio } = setup(json);
    const s = socket();
    s.open();
    handle.sendAudio(new Uint8Array([1, 2, 3, 4]));
    expect(JSON.parse(sentText(s, 1))).toEqual({
      type: "input_audio_buffer.append",
      audio: "AQIDBA==",
    });
    s.receive(delta(new Uint8Array([9, 8])));
    expect(events.map((e) => e.type)).toEqual(["response.audio_delta"]);
    expect(audio).toHaveLength(1);
    expect(Array.from(audio[0]?.bytes ?? [])).toEqual([9, 8]);
    expect(audio[0]?.responseId).toBe("r1");
    expect(audio[0]?.itemId).toBe("i1");
  });

  it("ignores inbound binary frames", () => {
    const { socket, audio } = setup(json);
    socket().open();
    socket().receive(new Uint8Array([1, 2]).buffer);
    expect(audio).toHaveLength(0);
  });

  it("drops sends before open", () => {
    const { handle, socket } = setup(json);
    handle.sendAudio(new Uint8Array(2));
    handle.cancelResponse();
    expect(socket().sent).toHaveLength(0);
  });
});

describe("binary transport", () => {
  it("sends raw bytes, treats inbound binary as audio, still parses JSON events", () => {
    const { handle, socket, events, audio } = setup(binary);
    const s = socket();
    s.open();
    const pcm = new Uint8Array([5, 6, 7, 8]);
    handle.sendAudio(pcm);
    expect(s.sent[1]).toBe(pcm);
    s.receive(new Uint8Array([1, 2, 3, 4]).buffer);
    expect(audio).toHaveLength(1);
    expect(Array.from(audio[0]?.bytes ?? [])).toEqual([1, 2, 3, 4]);
    expect(audio[0]?.responseId).toBeUndefined();
    s.receive(
      JSON.stringify({ type: "response.created", response: { id: "r1" } }),
    );
    expect(events).toEqual([{ type: "response.created", responseId: "r1" }]);
  });

  it("does not play a JSON delta", () => {
    const { socket, events, audio } = setup(binary);
    socket().open();
    socket().receive(delta(new Uint8Array([1, 2])));
    expect(events).toHaveLength(0);
    expect(audio).toHaveLength(0);
  });
});

describe("barge-in helpers", () => {
  it("sends response.cancel and conversation.item.truncate", () => {
    const { handle, socket } = setup(json);
    const s = socket();
    s.open();
    handle.cancelResponse();
    handle.truncate("item-1", 1234.6);
    expect(JSON.parse(sentText(s, 1))).toEqual({ type: "response.cancel" });
    expect(JSON.parse(sentText(s, 2))).toEqual({
      type: "conversation.item.truncate",
      item_id: "item-1",
      content_index: 0,
      audio_end_ms: 1235,
    });
  });
});

describe("malformed input", () => {
  it("ignores malformed and unknown JSON", () => {
    const { socket, events, audio } = setup(json);
    socket().open();
    for (const frame of [
      "{nope",
      "null",
      "[]",
      '{"type":"mystery"}',
      '{"type":"response.created"}',
    ]) {
      socket().receive(frame);
    }
    expect(events).toHaveLength(0);
    expect(audio).toHaveLength(0);
  });

  it("ignores an invalid base64 delta payload", () => {
    const { socket, audio, events } = setup(json);
    socket().open();
    socket().receive(
      JSON.stringify({ type: "response.audio.delta", delta: "***" }),
    );
    expect(audio).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(fromBase64("***")).toBeUndefined();
  });
});

// BC-54: an undecodable audio delta dispatches neither callback.
describe("BC-54 invalid audio delta", () => {
  const badDeltas: [string, string][] = [
    ["symbols", "***"],
    ["bad padding", "A"],
    ["leading padding", "=AAA"],
  ];
  for (const [name, bad] of badDeltas) {
    it(`drops ${name} without onEvent or onAudio, then recovers`, () => {
      const { socket, events, audio } = setup(json);
      socket().open();
      socket().receive(
        JSON.stringify({
          type: "response.output_audio.delta",
          response_id: "r1",
          item_id: "i1",
          delta: bad,
        }),
      );
      const droppedBoth = events.length === 0 && audio.length === 0;
      if (!droppedBoth) throw new Error("invalid delta reached a callback");
      socket().receive(delta(new Uint8Array([4, 5])));
      socket().receive(
        JSON.stringify({
          type: "response.done",
          response: { id: "r1", status: "completed" },
        }),
      );
      expect(events.map((e) => e.type)).toEqual([
        "response.audio_delta",
        "response.done",
      ]);
      expect(audio).toHaveLength(1);
      expect(Array.from(audio[0]?.bytes ?? [])).toEqual([4, 5]);
    });
  }
});

// BC-59: invalid PCM never reaches a callback, in either transport.
describe("BC-59 invalid PCM", () => {
  const rawDelta = (payload: string) =>
    JSON.stringify({
      type: "response.output_audio.delta",
      response_id: "r1",
      item_id: "i1",
      delta: payload,
    });
  const done = JSON.stringify({
    type: "response.done",
    response: { id: "r1", status: "completed" },
  });

  const jsonBad: [string, string][] = [
    ["empty audio", toBase64(new Uint8Array(0))],
    ["one byte", toBase64(new Uint8Array([1]))],
    ["three bytes", toBase64(new Uint8Array([1, 2, 3]))],
    ["invalid base64", "***"],
  ];
  for (const [name, bad] of jsonBad) {
    it(`json: drops ${name}, then valid audio and response.done still work`, () => {
      const { socket, events, audio } = setup(json);
      socket().open();
      socket().receive(rawDelta(bad));
      const droppedBoth = events.length === 0 && audio.length === 0;
      if (!droppedBoth) throw new Error("invalid PCM reached a callback");
      socket().receive(delta(new Uint8Array([4, 5])));
      socket().receive(done);
      expect(events.map((e) => e.type)).toEqual([
        "response.audio_delta",
        "response.done",
      ]);
      expect(audio).toHaveLength(1);
      expect(Array.from(audio[0]?.bytes ?? [])).toEqual([4, 5]);
    });
  }

  const binaryJsonDeltas: [string, string][] = [
    ["valid", delta(new Uint8Array([1, 2]))],
    ["invalid", rawDelta("***")],
  ];
  for (const [name, frame] of binaryJsonDeltas) {
    it(`binary: drops a ${name} JSON delta, lifecycle events still arrive`, () => {
      const { socket, events, audio } = setup(binary);
      socket().open();
      socket().receive(frame);
      const droppedBoth = events.length === 0 && audio.length === 0;
      if (!droppedBoth) throw new Error("JSON delta reached a callback");
      socket().receive(done);
      expect(events.map((e) => e.type)).toEqual(["response.done"]);
      expect(audio).toHaveLength(0);
    });
  }

  const binaryBad: [string, Uint8Array][] = [
    ["empty", new Uint8Array(0)],
    ["one byte", new Uint8Array([1])],
    ["odd length", new Uint8Array([1, 2, 3])],
  ];
  for (const [name, bytes] of binaryBad) {
    it(`binary: drops a ${name} frame, then a valid frame plays`, () => {
      const { socket, audio } = setup(binary);
      socket().open();
      socket().receive(bytes.buffer);
      if (audio.length !== 0) throw new Error("invalid frame reached onAudio");
      socket().receive(new Uint8Array([9, 8]).buffer);
      expect(audio).toHaveLength(1);
      expect(Array.from(audio[0]?.bytes ?? [])).toEqual([9, 8]);
    });
  }
});

// Codec-aware inbound audio validation across both transports.
describe("codec x transport inbound audio", () => {
  const opus = (t: VoiceTuning): VoiceTuning => ({ ...t, codec: "opus" });
  const rows: [string, VoiceTuning, number[], boolean][] = [
    ["json opus 3 bytes", opus(json), [1, 2, 3], true],
    ["json opus empty", opus(json), [], false],
    ["json pcm16 even", json, [1, 2], true],
    ["json pcm16 odd", json, [1, 2, 3], false],
    ["json pcm16 empty", json, [], false],
    ["binary opus 3 bytes", opus(binary), [1, 2, 3], true],
    ["binary opus empty", opus(binary), [], false],
    ["binary pcm16 even", binary, [1, 2], true],
    ["binary pcm16 odd", binary, [1, 2, 3], false],
    ["binary pcm16 empty", binary, [], false],
  ];
  for (const [name, tuning, data, accepted] of rows) {
    it(`${name}: ${accepted ? "reaches" : "never reaches"} onAudio`, () => {
      const { socket, audio } = setup(tuning);
      socket().open();
      const bytes = new Uint8Array(data);
      socket().receive(
        tuning.transport === "json" ? delta(bytes) : bytes.buffer,
      );
      expect(audio.length === (accepted ? 1 : 0)).toBe(true);
      if (accepted) {
        expect(audio[0]?.bytes.length === data.length).toBe(true);
      }
    });
  }
});

// BC-55: nothing is delivered after close.
describe("BC-55 close during dispatch", () => {
  function closing(tuning: VoiceTuning) {
    const sockets: FakeSocket[] = [];
    const events: ServerEvent[] = [];
    const audio: InboundAudio[] = [];
    const ref: { handle?: ReturnType<typeof connectRealtime> } = {};
    ref.handle = connectRealtime({
      token: TOKEN,
      instructions: "",
      keyterms: [],
      tuning,
      onEvent: (e) => {
        events.push(e);
        ref.handle?.close();
      },
      onAudio: (a) => audio.push(a),
      createSocket: (u, p, h) => {
        const s = new FakeSocket(u, p, h);
        sockets.push(s);
        return s;
      },
    });
    return { sockets, events, audio };
  }

  it("skips onAudio when onEvent closes, and ignores later messages", () => {
    const { sockets, events, audio } = closing(json);
    const s = first(sockets);
    s.open();
    s.receive(delta(new Uint8Array([1, 2])));
    if (audio.length !== 0) throw new Error("audio delivered after close");
    expect(events).toHaveLength(1);
    expect(s.closeCalls).toBe(1);
    s.receive(delta(new Uint8Array([3, 4])));
    s.receive(
      JSON.stringify({ type: "response.created", response: { id: "r2" } }),
    );
    if (events.length !== 1 || audio.length !== 0)
      throw new Error("message handled after close");
  });

  it("ignores binary frames after close", () => {
    const { sockets, events, audio } = closing(binary);
    const s = first(sockets);
    s.open();
    s.receive(
      JSON.stringify({ type: "response.created", response: { id: "r1" } }),
    );
    expect(events).toHaveLength(1);
    s.receive(new Uint8Array([1, 2]).buffer);
    expect(audio).toHaveLength(0);
  });
});

describe("close", () => {
  it("is idempotent and safe when the socket throws", () => {
    const onClose = vi.fn();
    const sockets: FakeSocket[] = [];
    const handle = connectRealtime({
      token: TOKEN,
      instructions: "",
      keyterms: [],
      tuning: json,
      onEvent: () => undefined,
      onAudio: () => undefined,
      onClose,
      createSocket: (u, p, h) => {
        const s = new FakeSocket(u, p, h);
        s.throwOnClose = true;
        sockets.push(s);
        return s;
      },
    });
    sockets[0]?.open();
    handle.close();
    expect(() => handle.close()).not.toThrow();
    expect(sockets[0]?.closeCalls).toBe(1);
    handle.sendAudio(new Uint8Array(2));
    expect(sockets[0]?.sent).toHaveLength(1);
  });

  it("reports a remote close once", () => {
    const onClose = vi.fn();
    const sockets: FakeSocket[] = [];
    connectRealtime({
      token: TOKEN,
      instructions: "",
      keyterms: [],
      tuning: json,
      onEvent: () => undefined,
      onAudio: () => undefined,
      onClose,
      createSocket: (u, p, h) => {
        const s = new FakeSocket(u, p, h);
        sockets.push(s);
        return s;
      },
    });
    sockets[0]?.handlers.close();
    sockets[0]?.handlers.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// BC-56: a malformed token never reaches the socket factory or an error message.
describe("BC-56 malformed token", () => {
  const BAD = [
    "bad token",
    "bad,token",
    "bad;token",
    "bad\ntoken",
    'bad"token',
    "bad/token",
    "bad(token)",
    "bädtoken",
    "",
  ];
  const run = (token: string, throwing = false) => {
    const sockets: FakeSocket[] = [];
    const factory = vi.fn((u: string, p: string[], h: SocketHandlers) => {
      if (throwing) throw new Error(`invalid subprotocol ${p.join(",")}`);
      const s = new FakeSocket(u, p, h);
      sockets.push(s);
      return s;
    });
    const onError = vi.fn();
    let thrown = false;
    let handle: ReturnType<typeof connectRealtime> | undefined;
    try {
      handle = connectRealtime({
        token,
        instructions: "",
        keyterms: [],
        tuning: json,
        onEvent: () => undefined,
        onAudio: () => undefined,
        onError,
        createSocket: factory,
      });
    } catch {
      thrown = true;
    }
    return { sockets, factory, onError, thrown, handle };
  };

  it.each(BAD)("rejects an illegal token without a socket", (token) => {
    const r = run(token);
    const failures: string[] = [];
    if (r.factory.mock.calls.length !== 0) failures.push("factory called");
    if (r.thrown) failures.push("threw");
    if (r.onError.mock.calls.length !== 1)
      failures.push("onError not called once");
    if (r.onError.mock.calls.some((c) => c.length !== 0))
      failures.push("onError got args");
    if (r.handle?.mock !== false) failures.push("handle shape");
    r.handle?.sendAudio(new Uint8Array(2));
    r.handle?.close();
    expect(failures).toEqual([]);
  });

  it("drops a factory exception that quotes the subprotocol", () => {
    const r = run("valid-token_123", true);
    const failures: string[] = [];
    if (r.thrown) failures.push("exception escaped");
    if (r.onError.mock.calls.length !== 1)
      failures.push("onError not called once");
    if (r.onError.mock.calls.some((c) => c.length !== 0))
      failures.push("onError got args");
    expect(failures).toEqual([]);
  });

  it("still opens a valid token with the url and subprotocol prefix", () => {
    const token = "xai.Abc-123_~+'!#$%&*^`|";
    const r = run(token);
    const p = r.sockets[0]?.protocols ?? [];
    const checks = {
      one: r.factory.mock.calls.length === 1,
      url: r.sockets[0]?.url === REALTIME_URL,
      urlText:
        REALTIME_URL === `wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`,
      single: p.length === 1,
      prefix: p[0]?.startsWith(SUBPROTOCOL_PREFIX) === true,
      length: p[0]?.length === SUBPROTOCOL_PREFIX.length + token.length,
      noError: r.onError.mock.calls.length === 0,
    };
    expect(Object.entries(checks).filter(([, ok]) => !ok)).toEqual([]);
  });

  it("opens no socket for the reserved mock token", () => {
    const r = run(mockSecretValue);
    expect(r.factory.mock.calls.length === 0).toBe(true);
    expect(r.onError.mock.calls.length === 0).toBe(true);
    expect(r.handle?.mock).toBe(true);
  });
});

describe("inbound token scrub", () => {
  const leaky = `before-${TOKEN}-after`;
  const errorWire = (message: string) =>
    JSON.stringify({ type: "error", error: { message } });
  const wires: [string, unknown][] = [
    [
      "session.created session.id",
      { type: "session.created", session: { id: leaky } },
    ],
    [
      "session.updated session.id",
      { type: "session.updated", session: { id: leaky } },
    ],
    [
      "session.updated session.instructions",
      { type: "session.updated", session: { instructions: leaky } },
    ],
    [
      "speech_started item_id",
      { type: "input_audio_buffer.speech_started", item_id: leaky },
    ],
    [
      "speech_stopped item_id",
      { type: "input_audio_buffer.speech_stopped", item_id: leaky },
    ],
    [
      "transcription.delta item_id",
      {
        type: "conversation.item.input_audio_transcription.delta",
        item_id: leaky,
        delta: "x",
      },
    ],
    [
      "transcription.delta text",
      {
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "i",
        delta: leaky,
      },
    ],
    [
      "transcription.updated text",
      {
        type: "conversation.item.input_audio_transcription.updated",
        item_id: "i",
        transcript: leaky,
      },
    ],
    [
      "transcription.completed item_id",
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: leaky,
        transcript: "x",
      },
    ],
    [
      "transcription.completed text",
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "i",
        transcript: leaky,
      },
    ],
    [
      "response.created id",
      { type: "response.created", response: { id: leaky } },
    ],
    ["response.done id", { type: "response.done", response: { id: leaky } }],
    [
      "response.cancelled id",
      { type: "response.cancelled", response: { id: leaky } },
    ],
    [
      "output_item.added response_id",
      {
        type: "response.output_item.added",
        response_id: leaky,
        item: { id: "i" },
      },
    ],
    [
      "output_item.added item.id",
      {
        type: "response.output_item.added",
        response_id: "r",
        item: { id: leaky },
      },
    ],
    [
      "audio delta response_id",
      {
        type: "response.output_audio.delta",
        response_id: leaky,
        item_id: "i",
        delta: toBase64(new Uint8Array([1, 2])),
      },
    ],
    [
      "audio delta item_id",
      {
        type: "response.audio.delta",
        response_id: "r",
        item_id: leaky,
        delta: toBase64(new Uint8Array([1, 2])),
      },
    ],
    [
      "audio delta delta",
      {
        type: "response.output_audio.delta",
        response_id: "r",
        item_id: "i",
        delta: leaky,
      },
    ],
    ["error message", { type: "error", error: { message: leaky } }],
  ];

  it.each(wires)("%s never reaches a callback", (_name, wire) => {
    const r = setup(json);
    r.socket().open();
    r.socket().receive(JSON.stringify(wire));
    const seen = JSON.stringify([r.events, r.audio]);
    expect(seen.includes(TOKEN)).toBe(false);
  });

  it("replaces a token-bearing error and keeps it out of call state", () => {
    const r = setup(json);
    r.socket().open();
    r.socket().receive(errorWire(leaky));
    expect(r.events).toHaveLength(1);
    const event = r.events[0];
    expect(
      event?.type === "error" && event.message === SERVER_ERROR_MESSAGE,
    ).toBe(true);
    let state = reduceCall(initialCallState, { type: "start" });
    state = reduceCall(state, { type: "connected" });
    for (const e of r.events)
      state = reduceCall(state, { type: "server", event: e });
    expect(JSON.stringify(state).includes(TOKEN)).toBe(false);
    expect(
      state.phase === "active" && state.lastError === SERVER_ERROR_MESSAGE,
    ).toBe(true);
  });

  it("passes a normal error through unchanged", () => {
    const r = setup(json);
    r.socket().open();
    r.socket().receive(errorWire("rate limited"));
    expect(r.events).toEqual([{ type: "error", message: "rate limited" }]);
  });
});
