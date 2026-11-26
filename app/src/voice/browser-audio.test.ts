import { describe, expect, it } from "vitest";
import { encodePcm16 } from "@steve/voice";
import {
  OpusUnavailableError,
  startBrowserAudio,
  type AudioDeps,
  type CaptureNodeLike,
  type ContextLike,
  type FlushSnapshot,
  type PlaybackNotice,
  type SourceLike,
} from "./browser-audio";

class FakeSource implements SourceLike {
  buffer: unknown;
  startedAt: number | undefined;
  stopped = false;
  connect(): void {}
  start(when: number): void {
    this.startedAt = when;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeContext implements ContextLike {
  sampleRate = 24000;
  currentTime = 0;
  destination = { connect() {}, disconnect() {} };
  closed = 0;
  sources: FakeSource[] = [];
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createBuffer() {
    return { copyToChannel() {} };
  }
  createBufferSource() {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed += 1;
    return Promise.resolve();
  }
}

function harness(
  codec: "pcm16-24k" | "opus" = "pcm16-24k",
  opus?: Parameters<typeof startBrowserAudio>[0]["opus"],
) {
  const context = new FakeContext();
  const posted: unknown[] = [];
  let toWorklet: ((m: unknown) => void) | undefined;
  const node: CaptureNodeLike = {
    port: {
      onmessage: null,
      postMessage: (m: unknown) => {
        posted.push(m);
        toWorklet?.(m);
      },
    },
    connect() {},
    disconnect() {},
  };
  let trackStops = 0;
  let tickFn: (() => void) | undefined;
  let cleared = 0;
  const ports = {
    createContext: () => context,
    getUserMedia: () =>
      Promise.resolve({
        getTracks: () => [
          { stop: () => (trackStops += 1) },
          { stop: () => (trackStops += 1) },
        ],
      }),
    loadWorklet: () => Promise.resolve(node),
  };
  const deps: AudioDeps = {
    createContext: () => ports.createContext(),
    getUserMedia: () => ports.getUserMedia(),
    loadWorklet: () => ports.loadWorklet(),
    clock: {
      setInterval: (fn) => {
        tickFn = fn;
        return 1;
      },
      clearInterval: () => {
        cleared += 1;
        tickFn = undefined;
      },
    },
  };
  const mic: Uint8Array[] = [];
  const notices: PlaybackNotice[] = [];
  const start = () =>
    startBrowserAudio({
      codec,
      ...(opus ? { opus } : {}),
      deps,
      onMicChunk: (b) => mic.push(b),
      onPlayback: (n) => notices.push(n),
    });
  const advance = (seconds: number) => {
    context.currentTime += seconds;
    tickFn?.();
  };
  // Frames carry the mute generation the worklet last saw (0 until told).
  let workletGen = 0;
  const sendFrame = (gen: number, samples: Float32Array) =>
    node.port.onmessage?.(
      new MessageEvent("message", { data: { gen, samples } }),
    );
  const send = (samples: Float32Array) => sendFrame(workletGen, samples);
  // Stand-in worklet: adopts the generation it is told about.
  toWorklet = (m) => {
    if (typeof m === "object" && m !== null) {
      const next = Reflect.get(m, "gen");
      if (typeof next === "number") workletGen = next;
    }
  };
  return {
    posted,
    sendFrame,
    context,
    deps,
    node,
    send,
    mic,
    notices,
    start,
    advance,
    ports,
    stops: () => trackStops,
    cleared: () => cleared,
    ticking: () => tickFn !== undefined,
  };
}

// 100 ms of 24 kHz PCM16.
const chunk = (responseId: string, itemId?: string) => ({
  bytes: new Uint8Array(4800),
  responseId,
  itemId,
});

describe("capture", () => {
  it("encodes worklet blocks as PCM16 and stops sending when muted", async () => {
    const h = harness();
    const audio = await h.start();
    const samples = new Float32Array([0, 0.5, -0.5]);
    h.send(samples);
    expect(h.mic).toHaveLength(1);
    expect(h.mic[0]).toEqual(encodePcm16(samples));
    audio.setMuted(true);
    h.send(samples);
    expect(h.mic).toHaveLength(1);
    audio.setMuted(false);
    h.send(samples);
    expect(h.mic).toHaveLength(2);
  });

  it("keeps playback active while muted", async () => {
    const h = harness();
    const audio = await h.start();
    audio.setMuted(true);
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.05);
    expect(h.context.sources).toHaveLength(1);
    expect(h.notices.map((n) => n.type)).toEqual([
      "playbackStarted",
      "playback",
    ]);
  });

  it("rejects a context that is not 24 kHz and releases the mic", async () => {
    const h = harness();
    h.context.sampleRate = 48000;
    await expect(h.start()).rejects.toThrow(/48000/);
    expect(h.stops()).toBe(2);
  });
});

// BC-49: mute must not leak muted samples into frames sent after unmute.
describe("BC-49 mute leak", () => {
  it("BC-49 setMuted notifies the worklet on each transition", async () => {
    const h = harness();
    const audio = await h.start();
    audio.setMuted(true);
    audio.setMuted(true);
    audio.setMuted(false);
    expect(h.posted).toEqual([
      { type: "mute", muted: true, gen: 1 },
      { type: "mute", muted: false, gen: 2 },
    ]);
  });

  // table: [name, frame gen relative to the unmute generation, expected sent]
  const cases: [
    string,
    (g: { muted: number; live: number }) => number,
    boolean,
  ][] = [
    [
      "BC-49 block queued under mute arrives after unmute is dropped",
      (g) => g.muted,
      false,
    ],
    [
      "BC-49 block from before the mute is dropped after unmute",
      () => 0,
      false,
    ],
    ["BC-49 fresh block after unmute is sent", (g) => g.live, true],
  ];
  for (const [name, genOf, sent] of cases) {
    it(name, async () => {
      const h = harness();
      const audio = await h.start();
      audio.setMuted(true);
      audio.setMuted(false);
      h.sendFrame(genOf({ muted: 1, live: 2 }), new Float32Array(960));
      expect(h.mic.length === 1).toBe(sent);
    });
  }

  it("BC-49 frame under active mute is dropped even with a current tag", async () => {
    const h = harness();
    const audio = await h.start();
    audio.setMuted(true);
    h.sendFrame(1, new Float32Array(960));
    expect(h.mic.length === 0).toBe(true);
  });

  it("BC-49 playback continues while muted", async () => {
    const h = harness();
    const audio = await h.start();
    audio.setMuted(true);
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.05);
    expect(h.context.sources.length === 1).toBe(true);
    expect(h.notices.some((n) => n.type === "playback")).toBe(true);
    expect(h.mic.length === 0).toBe(true);
  });
});

describe("codec", () => {
  it("fails clearly for opus without a codec port", async () => {
    const h = harness("opus");
    await expect(h.start()).rejects.toBeInstanceOf(OpusUnavailableError);
    expect(h.stops()).toBe(0);
  });

  it("uses an injected opus port", async () => {
    const h = harness("opus", {
      encode: () => new Uint8Array([7]),
      decode: () => new Float32Array(2400),
    });
    const audio = await h.start();
    h.send(new Float32Array(4));
    expect(Array.from(h.mic[0] ?? [])).toEqual([7]);
    audio.enqueue(chunk("r1"));
    expect(h.context.sources).toHaveLength(1);
  });
});

describe("playback", () => {
  it("schedules chunks back to back and reports start, progress and drain", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    audio.enqueue(chunk("r1", "i1"));
    const [a, b] = h.context.sources;
    expect(b?.startedAt).toBeCloseTo((a?.startedAt ?? 0) + 0.1, 5);
    h.advance(0.13);
    expect(h.notices[0]).toEqual({
      type: "playbackStarted",
      responseId: "r1",
      itemId: "i1",
      generation: 0,
    });
    expect(h.notices[1]).toEqual({
      type: "playback",
      playedMs: 100,
      generation: 0,
    });
    h.advance(0.2);
    expect(h.notices.at(-1)).toEqual({
      type: "playbackDrained",
      generation: 0,
    });
    expect(h.ticking()).toBe(false);
  });

  it("reports playedMs of the audible item", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.08);
    expect(audio.playedMs()).toBe(50);
  });
});

// BC-50: a queue underrun must not reset the item offset within a generation.
describe("BC-50 underrun keeps item offset", () => {
  it("BC-50 gap then more of the same item reports the cumulative offset", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.13);
    h.advance(0.2);
    expect(h.notices.at(-1)?.type === "playbackDrained").toBe(true);
    expect(audio.playedMs() === 100).toBe(true);
    h.advance(1);
    h.notices.length = 0;
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r1",
      itemId: "i1",
    });
    h.advance(0.05);
    h.advance(0.1);
    const played = h.notices.filter((n) => n.type === "playback");
    expect(played.some((n) => n.playedMs === 120)).toBe(true);
    expect(played.every((n) => n.playedMs >= 100)).toBe(true);
  });

  // table: [name, next item after the gap, expected playedMs after it plays 20 ms]
  const cases: [string, string, number][] = [
    ["BC-50 same item continues from the banked offset", "i1", 120],
    ["BC-50 a different item starts at its own offset", "i2", 20],
  ];
  for (const [name, next, expected] of cases) {
    it(name, async () => {
      const h = harness();
      const audio = await h.start();
      audio.enqueue(chunk("r1", "i1"));
      h.advance(0.13);
      h.advance(0.2);
      h.advance(1);
      audio.enqueue({
        bytes: new Uint8Array(960),
        responseId: "r1",
        itemId: next,
      });
      h.advance(0.1);
      h.advance(0.1);
      expect(audio.playedMs() === expected).toBe(true);
    });
  }

  it("BC-50 flush resets the cumulative offset", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.13);
    h.advance(0.2);
    audio.flush();
    expect(audio.playedMs() === 0).toBe(true);
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r2",
      itemId: "i1",
    });
    h.advance(0.1);
    h.advance(0.1);
    expect(audio.playedMs() === 20).toBe(true);
  });
});

// BC-51: a chunk without an item id belongs to at most one item.
describe("BC-51 omitted item id", () => {
  const small = (itemId?: string) => ({
    bytes: new Uint8Array(960),
    responseId: "r1",
    itemId,
  });
  // table: [name, item ids in order, expected playedMs once the last one is audible]
  const cases: [string, (string | undefined)[], number][] = [
    ["BC-51 A, omitted, B reports only B", ["A", undefined, "B"], 20],
    [
      "BC-51 A, omitted, A counts the omitted chunk once",
      ["A", undefined, "A"],
      60,
    ],
    [
      "BC-51 unidentified prefix adopts the first id that appears",
      [undefined, "B"],
      40,
    ],
  ];
  for (const [name, ids, expected] of cases) {
    it(name, async () => {
      const h = harness();
      const audio = await h.start();
      for (const id of ids) audio.enqueue(small(id));
      // Each chunk lasts 20 ms and the first starts at 30 ms.
      h.advance(0.03 + 0.02 * (ids.length - 1) + 0.02);
      expect(audio.playedMs() === expected).toBe(true);
    });
  }

  it("BC-51 omitted chunk after A attaches to A and never to a later item", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(small("A"));
    audio.enqueue(small(undefined));
    audio.enqueue(small("B"));
    h.advance(0.03 + 0.04 + 0.01);
    expect(audio.playedMs() === 10).toBe(true);
    h.advance(0.01);
    expect(audio.playedMs() === 20).toBe(true);
  });
});

// BC-52: a newly learned item id reaches the reducer.
describe("BC-52 late item id", () => {
  const small = (itemId?: string) => ({
    bytes: new Uint8Array(960),
    responseId: "r1",
    itemId,
  });
  const starts = (h: { notices: PlaybackNotice[] }) =>
    h.notices.filter((n) => n.type === "playbackStarted");

  it("BC-52 re-announces with the learned id and keeps the offset", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(small(undefined));
    h.advance(0.04);
    expect(starts(h)).toHaveLength(1);
    expect(starts(h)[0]?.itemId === undefined).toBe(true);
    audio.enqueue(small("B"));
    h.advance(0.01);
    const s = starts(h);
    expect(s).toHaveLength(2);
    expect(s[1]).toMatchObject({
      itemId: "B",
      responseId: "r1",
      generation: 0,
    });
    expect(audio.playedMs() === 20).toBe(true);
    h.advance(0.01);
    expect(audio.playedMs() === 30).toBe(true);
  });

  it("BC-52 keeps the offset when the unlabeled queue already drained", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(small(undefined));
    h.advance(0.04);
    h.advance(0.02);
    audio.enqueue(small("B"));
    h.advance(0.04);
    expect(starts(h)[1]).toMatchObject({ itemId: "B", generation: 0 });
    expect(audio.playedMs() >= 20).toBe(true);
  });

  it("BC-52 a new generation does not replay the old item id", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(small(undefined));
    audio.enqueue(small("B"));
    h.advance(0.04);
    audio.flush();
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r2",
      itemId: undefined,
    });
    h.advance(0.04);
    const last = starts(h).at(-1);
    expect(last?.generation === 1).toBe(true);
    expect(last?.itemId === undefined).toBe(true);
  });

  it("BC-52 A, omitted, B does not give A's audio to B", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(small("A"));
    audio.enqueue(small(undefined));
    audio.enqueue(small("B"));
    h.advance(0.03 + 0.04 + 0.01);
    expect(audio.playedMs() === 10).toBe(true);
    expect(starts(h).every((n) => n.itemId !== "B" || n.generation === 0)).toBe(
      true,
    );
  });
});

describe("flush", () => {
  it("drops queued audio, reports the retired generation, and ignores late chunks", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.05);
    h.notices.length = 0;
    audio.flush();
    expect(h.context.sources.every((s) => s.stopped)).toBe(true);
    expect(h.notices).toEqual([{ type: "playbackDrained", generation: 0 }]);
    expect(audio.generation).toBe(1);
    expect(h.ticking()).toBe(false);

    audio.enqueue(chunk("r1", "i1"));
    expect(h.context.sources).toHaveLength(2);

    audio.enqueue(chunk("r2", "i2"));
    expect(h.context.sources).toHaveLength(3);
    h.advance(0.05);
    expect(h.notices[1]).toMatchObject({
      type: "playbackStarted",
      responseId: "r2",
      generation: 1,
    });
  });

  it("reports drained for an empty queue and accepts an explicit generation", async () => {
    const h = harness();
    const audio = await h.start();
    audio.flush(5);
    audio.flush();
    expect(h.notices).toEqual([
      { type: "playbackDrained", generation: 0 },
      { type: "playbackDrained", generation: 5 },
    ]);
    expect(audio.generation).toBe(6);
  });

  it("ignores audio of a response the caller discarded", async () => {
    const h = harness();
    const audio = await h.start();
    audio.discardResponse("r9");
    audio.enqueue(chunk("r9"));
    expect(h.context.sources).toHaveLength(0);
  });
});

// Barge-in must pair the item id and offset from one clock read.
describe("flush snapshot", () => {
  const jump = (h: ReturnType<typeof harness>, seconds: number) => {
    h.context.currentTime += seconds;
  };
  const rows: {
    readonly name: string;
    readonly run: (
      h: ReturnType<typeof harness>,
      audio: Awaited<ReturnType<typeof startBrowserAudio>>,
    ) => FlushSnapshot;
  }[] = [
    {
      name: "a: after announcing A, flush during B returns B and 25 ms",
      run: (h, audio) => {
        audio.enqueue(chunk("rA", "A"));
        audio.enqueue(chunk("rB", "B"));
        h.advance(0.05);
        const startedA =
          h.notices[0]?.type === "playbackStarted" &&
          h.notices[0].itemId === "A";
        if (!startedA) throw new Error("expected A to be announced");
        jump(h, 0.105);
        return audio.flush();
      },
    },
    {
      name: "b: flush before the first tick has 50 ms and no item id",
      run: (h, audio) => {
        audio.enqueue(chunk("r1"));
        jump(h, 0.08);
        if (h.notices.some((n) => n.type === "playbackStarted")) {
          throw new Error("tick announced an item");
        }
        return audio.flush();
      },
    },
    {
      name: "c: late item id before the next tick is in the snapshot",
      run: (h, audio) => {
        audio.enqueue(chunk("r1"));
        h.advance(0.04);
        const startedBlank =
          h.notices[0]?.type === "playbackStarted" &&
          h.notices[0].itemId === undefined;
        if (!startedBlank) throw new Error("expected a start with no item id");
        audio.enqueue(chunk("r1", "i1"));
        return audio.flush();
      },
    },
    {
      name: "flush while A is the only audible item",
      run: (h, audio) => {
        audio.enqueue(chunk("rA", "A"));
        h.advance(0.08);
        return audio.flush();
      },
    },
    {
      name: "flush after a tick has announced B",
      run: (h, audio) => {
        audio.enqueue(chunk("rA", "A"));
        audio.enqueue(chunk("rB", "B"));
        h.advance(0.16);
        const startedB = h.notices.some(
          (n) => n.type === "playbackStarted" && n.itemId === "B",
        );
        if (!startedB) throw new Error("expected B to be announced");
        return audio.flush();
      },
    },
  ];
  const expected: Record<string, { itemId: string | undefined; playedMs: number; responseId: string }> = {
    "a: after announcing A, flush during B returns B and 25 ms": {
      itemId: "B",
      playedMs: 25,
      responseId: "rB",
    },
    "b: flush before the first tick has 50 ms and no item id": {
      itemId: undefined,
      playedMs: 50,
      responseId: "r1",
    },
    "c: late item id before the next tick is in the snapshot": {
      itemId: "i1",
      playedMs: 10,
      responseId: "r1",
    },
    "flush while A is the only audible item": {
      itemId: "A",
      playedMs: 50,
      responseId: "rA",
    },
    "flush after a tick has announced B": {
      itemId: "B",
      playedMs: 30,
      responseId: "rB",
    },
  };
  for (const row of rows) {
    it(row.name, async () => {
      const h = harness();
      const audio = await h.start();
      const snap = row.run(h, audio);
      const want = expected[row.name];
      if (want === undefined) throw new Error("missing expectation");
      expect(
        snap.itemId === want.itemId &&
          snap.playedMs === want.playedMs &&
          snap.responseId === want.responseId &&
          snap.generation === 0,
      ).toBe(true);
    });
  }
});

describe("startup failure cleanup", () => {
  const fail = new Error("startup failed");
  const rows: [string, (h: ReturnType<typeof harness>) => void][] = [
    ["getUserMedia", (h) => {
      h.ports.getUserMedia = () => Promise.reject(fail);
    }],
    ["context create", (h) => {
      h.ports.createContext = () => {
        throw fail;
      };
    }],
    ["sample-rate", (h) => {
      h.context.sampleRate = 48000;
    }],
    ["resume", (h) => {
      h.context.resume = () => Promise.reject(fail);
    }],
    ["worklet load", (h) => {
      h.ports.loadWorklet = () => Promise.reject(fail);
    }],
    ["graph connect", (h) => {
      h.node.connect = () => {
        throw fail;
      };
    }],
  ];
  for (const [step, arrange] of rows) {
    it(`${step}: start rejects and resources are released`, async () => {
      const h = harness();
      arrange(h);
      let rejected = false;
      try {
        await h.start();
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
      if (step === "getUserMedia") {
        expect(h.stops() === 0 && h.context.closed === 0).toBe(true);
      } else if (step === "context create") {
        expect(h.stops() === 2 && h.context.closed === 0).toBe(true);
      } else {
        expect(h.stops() === 2 && h.context.closed === 1).toBe(true);
      }
    });
  }
});

describe("codec re-entry", () => {
  it("does not send a mic chunk if encode flushes or closes", async () => {
    const cases: ("flush" | "close")[] = ["flush", "close"];
    for (const action of cases) {
      let audio: Awaited<ReturnType<typeof startBrowserAudio>> | undefined;
      const opus = {
        encode: (samples: Float32Array) => {
          if (action === "flush") audio?.flush();
          else audio?.close();
          return encodePcm16(samples);
        },
        decode: (bytes: Uint8Array) => new Float32Array(bytes.length / 2),
      };
      const h = harness("opus", opus);
      audio = await h.start();
      const before = h.mic.length;
      h.send(new Float32Array(16));
      expect(h.mic.length === before).toBe(true);
    }
  });

  it("does not start playback if decode flushes or closes", async () => {
    const cases: ("flush" | "close")[] = ["flush", "close"];
    for (const action of cases) {
      let audio: Awaited<ReturnType<typeof startBrowserAudio>> | undefined;
      const opus = {
        encode: (samples: Float32Array) => encodePcm16(samples),
        decode: (bytes: Uint8Array) => {
          if (action === "flush") audio?.flush();
          else audio?.close();
          return new Float32Array(bytes.length / 2 || 1);
        },
      };
      const h = harness("opus", opus);
      audio = await h.start();
      const before = h.context.sources.length;
      audio.enqueue(chunk("r1", "i1"));
      expect(h.context.sources.length === before).toBe(true);
    }
  });
});

describe("codec re-entry with an unchanged public generation", () => {
  // BC-63: flush(audio.generation) keeps the public generation, so only the
  // flush/close epoch can tell the in-flight codec call it is stale.
  it("BC-63 flush(audio.generation) drops an in-flight encode", async () => {
    let audio: Awaited<ReturnType<typeof startBrowserAudio>> | undefined;
    const opus = {
      encode: (samples: Float32Array) => {
        audio?.flush(audio.generation);
        return encodePcm16(samples);
      },
      decode: (bytes: Uint8Array) => new Float32Array(bytes.length / 2),
    };
    const h = harness("opus", opus);
    audio = await h.start();
    const generation = audio.generation;
    h.send(new Float32Array(16));
    expect(audio.generation).toBe(generation);
    expect(h.mic).toHaveLength(0);
  });

  it("BC-63 flush(audio.generation) drops an in-flight decode", async () => {
    let audio: Awaited<ReturnType<typeof startBrowserAudio>> | undefined;
    const opus = {
      encode: (samples: Float32Array) => encodePcm16(samples),
      decode: (bytes: Uint8Array) => {
        audio?.flush(audio.generation);
        return new Float32Array(bytes.length / 2 || 1);
      },
    };
    const h = harness("opus", opus);
    audio = await h.start();
    const generation = audio.generation;
    audio.enqueue(chunk("r1", "i1"));
    expect(audio.generation).toBe(generation);
    expect(h.context.sources).toHaveLength(0);
  });
});

describe("empty chunk retirement", () => {
  it("retires a response admitted with an empty chunk", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue({ bytes: new Uint8Array(0), responseId: "r1", itemId: undefined });
    expect(h.context.sources).toHaveLength(0);
    audio.flush();
    audio.enqueue(chunk("r1", "i1"));
    expect(h.context.sources).toHaveLength(0);
  });
});

describe("playedMs after close", () => {
  it("returns 0 after drain and close", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.2);
    const drained = h.notices.some((n) => n.type === "playbackDrained");
    expect(drained).toBe(true);
    audio.close();
    expect(audio.playedMs() === 0).toBe(true);
  });
});

describe("close", () => {
  it("stops tracks, empties the queue, closes the context, and is idempotent", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    audio.close();
    expect(() => audio.close()).not.toThrow();
    expect(h.stops()).toBe(2);
    expect(h.context.closed).toBe(1);
    expect(h.context.sources[0]?.stopped).toBe(true);
    expect(h.node.port.onmessage).toBeNull();
    expect(h.ticking()).toBe(false);
    audio.enqueue(chunk("r2"));
    audio.flush();
    expect(h.context.sources).toHaveLength(1);
    expect(h.notices).toEqual([]);
  });
});

describe("BC-53 flush relabel", () => {
  type Kind = "playbackStarted" | "playback" | "playbackDrained";
  const cases: {
    name: string;
    trigger: Kind;
    action: "flush" | "close";
    expected: { type: Kind; generation: number }[];
  }[] = [
    {
      name: "flush in playbackStarted",
      trigger: "playbackStarted",
      action: "flush",
      expected: [
        { type: "playbackStarted", generation: 0 },
        { type: "playbackDrained", generation: 0 },
      ],
    },
    {
      name: "close in playback",
      trigger: "playback",
      action: "close",
      expected: [
        { type: "playbackStarted", generation: 0 },
        { type: "playback", generation: 0 },
      ],
    },
    {
      name: "close in playbackStarted",
      trigger: "playbackStarted",
      action: "close",
      expected: [{ type: "playbackStarted", generation: 0 }],
    },
    {
      name: "flush in playback",
      trigger: "playback",
      action: "flush",
      expected: [
        { type: "playbackStarted", generation: 0 },
        { type: "playback", generation: 0 },
        { type: "playbackDrained", generation: 0 },
      ],
    },
  ];

  it("BC-53 a re-entrant flush or close stops the tick", async () => {
    const bad: string[] = [];
    for (const c of cases) {
      const h = harness();
      const notices: { type: string; generation: number }[] = [];
      let audio: Awaited<ReturnType<typeof h.start>> | undefined;
      audio = await startBrowserAudio({
        codec: "pcm16-24k",
        deps: h.deps,
        onMicChunk: () => undefined,
        onPlayback: (n) => {
          notices.push({ type: n.type, generation: n.generation });
          if (
            n.type === c.trigger &&
            !notices.slice(0, -1).some((x) => x.type === c.trigger)
          ) {
            audio?.[c.action]();
          }
        },
      });
      audio.enqueue(chunk("r1", "i1"));
      audio.enqueue(chunk("r1", "i1"));
      h.advance(0.13);
      const ok =
        notices.length === c.expected.length &&
        c.expected.every(
          (e, i) =>
            notices[i]?.type === e.type &&
            notices[i]?.generation === e.generation,
        );
      if (!ok) bad.push(c.name);
    }
    expect(bad.length === 0).toBe(true);
  });

  it("BC-53 a tick without re-entry still reports started, progress, drain", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "i1"));
    h.advance(0.13);
    h.advance(0.2);
    const types = h.notices.map((n) => n.type).join(",");
    expect(types === "playbackStarted,playback,playbackDrained").toBe(true);
    expect(h.notices.every((n) => n.generation === 0)).toBe(true);
  });
});

// BC-57: playedMs resolves the audible item and offset from the audio clock,
// not from the item the last 50 ms tick selected. A chunk enqueued at clock 0
// is scheduled at the 30 ms lead, so played = clock - 30 ms, clamped to its length.
describe("BC-57 playedMs reads the audio clock", () => {
  // [name, audio clock in seconds after enqueue at 0, expected playedMs]
  const cases: [string, number, number][] = [
    ["BC-57 before the scheduled lead nothing has played", 0.019, 0],
    ["BC-57 19 ms after the lead, no tick ran", 0.049, 19],
    ["BC-57 50 ms after the lead, no tick ran", 0.08, 50],
    ["BC-57 past the end clamps to the chunk length", 0.5, 100],
  ];
  it("BC-57 reports the clock offset without a tick", async () => {
    const bad: string[] = [];
    for (const [name, clock, expected] of cases) {
      const h = harness();
      const audio = await h.start();
      audio.enqueue(chunk("r1", "i1"));
      h.context.currentTime = clock;
      if (audio.playedMs() !== expected) bad.push(name);
    }
    expect(bad.length === 0).toBe(true);
  });

  it("BC-57 reads the item at the clock, not the item of the last tick", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue({
      bytes: new Uint8Array(1920),
      responseId: "r1",
      itemId: "A",
    }); // 40 ms
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r1",
      itemId: "B",
    }); // 20 ms
    h.advance(0.05); // tick selects A (A plays 30..70 ms)
    const atTick = audio.playedMs() === 20;
    h.context.currentTime = 0.06; // still A, 30 ms in, no tick since 50 ms
    const aDone = audio.playedMs() === 30;
    h.context.currentTime = 0.09; // B done, no tick since 50 ms
    const bPlayed = audio.playedMs() === 20;
    expect(atTick && aDone && bPlayed).toBe(true);
  });
});

// BC-58: switching items must not erase the bank of the previous item.
describe("BC-58 banks per response and item", () => {
  const play = (h: ReturnType<typeof harness>) => {
    h.advance(0.13);
    h.advance(0.2);
  };
  it("BC-58 A, B, A across drains reports A's cumulative offset", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "A"));
    play(h);
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r1",
      itemId: "B",
    });
    play(h);
    const bPlayed = audio.playedMs() === 20;
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r1",
      itemId: "A",
    });
    h.advance(0.1);
    h.advance(0.1);
    const aTotal = audio.playedMs() === 120;
    expect(bPlayed && aTotal).toBe(true);
    expect(
      h.notices.some((n) => n.type === "playback" && n.playedMs === 120),
    ).toBe(true);
  });

  it("BC-58 flush resets every bank", async () => {
    const h = harness();
    const audio = await h.start();
    audio.enqueue(chunk("r1", "A"));
    play(h);
    audio.flush();
    const zero = audio.playedMs() === 0;
    audio.enqueue({
      bytes: new Uint8Array(960),
      responseId: "r2",
      itemId: "A",
    });
    h.advance(0.1);
    h.advance(0.1);
    expect(zero && audio.playedMs() === 20).toBe(true);
  });
});
