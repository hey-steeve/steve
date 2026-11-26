import { describe, expect, it } from "vitest";
import type { VoiceTuning } from "@steve/voice";
import type {
  BrowserAudio,
  BrowserAudioOptions,
  FlushSnapshot,
} from "./browser-audio";
import type { RealtimeSocket, RealtimeSocketOptions } from "./realtime-socket";
import {
  callCapMs,
  createLiveCall,
  type EndReason,
  type ThreadEvent,
} from "./live-call";

const tuning: VoiceTuning = {
  reasoningEffort: "none",
  codec: "pcm16-24k",
  transport: "json",
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("missing fixture");
  return item;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(
  opts: {
    manualToken?: boolean;
    manualAudio?: boolean;
    gateFirstOnly?: boolean;
  } = {},
) {
  let t = 1_000;
  const timers: { id: number; fn: () => void; at: number }[] = [];
  let nextId = 1;
  const log: string[] = [];
  const sockets: { options: RealtimeSocketOptions; socket: FakeSocket }[] = [];
  const audios: FakeAudio[] = [];
  const threads: ThreadEvent[] = [];
  const tokenGate = deferred<{ value: string }>();
  const audioGate = deferred<void>();
  let mints = 0;
  let starts = 0;
  let signal: AbortSignal | undefined;

  class FakeSocket implements RealtimeSocket {
    mock = false;
    closed = 0;
    sentAudio = 0;
    cancels = 0;
    truncates: [string, number][] = [];
    sendAudio() {
      this.sentAudio++;
    }
    cancelResponse() {
      this.cancels++;
    }
    truncate(id: string, ms: number) {
      this.truncates.push([id, ms]);
    }
    close() {
      this.closed++;
    }
  }
  class FakeAudio implements BrowserAudio {
    closed = 0;
    muted: boolean | undefined;
    flushes = 0;
    readonly options: BrowserAudioOptions;
    constructor(options: BrowserAudioOptions) {
      this.options = options;
    }
    readonly generation = 0;
    setMuted(m: boolean) {
      this.muted = m;
    }
    enqueued = 0;
    enqueue() {
      this.enqueued++;
    }
    discardResponse() {}
    playedMs() {
      return 420;
    }
    flushedWith: (number | undefined)[] = [];
    snapshot: FlushSnapshot = {
      generation: 0,
      responseId: "r1",
      itemId: "snap-item",
      playedMs: 77,
    };
    flush(next?: number) {
      this.flushes++;
      this.flushedWith.push(next);
      return this.snapshot;
    }
    close() {
      this.closed++;
    }
  }

  const ctl = createLiveCall({
    fetchToken: (s) => {
      mints++;
      signal = s;
      const gated = opts.manualToken && (!opts.gateFirstOnly || mints === 1);
      return gated
        ? tokenGate.promise
        : Promise.resolve({ value: "token" });
    },
    connect: (o) => {
      log.push("socket");
      const socket = new FakeSocket();
      sockets.push({ options: o, socket });
      return socket;
    },
    startAudio: async (o) => {
      starts++;
      if (opts.manualAudio && (!opts.gateFirstOnly || starts === 1)) {
        await audioGate.promise;
      }
      const a = new FakeAudio(o);
      audios.push(a);
      return a;
    },
    instructions: () => "base",
    onThreadEvent: (e) => threads.push(e),
    keyterms: [],
    tuning,
    now: () => t,
    setTimeout: (fn, ms) => {
      log.push("timer");
      const id = nextId++;
      timers.push({ id, fn, at: t + ms });
      return id;
    },
    clearTimeout: (h) => {
      const i = timers.findIndex((x) => x.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });

  const advance = (ms: number) => {
    t += ms;
    for (const x of timers.filter((x) => x.at <= t)) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
  };
  const skip = (ms: number) => {
    t += ms;
  };
  const reason = (): EndReason | undefined => ctl.getSnapshot().endReason;
  return {
    ctl,
    log,
    sockets,
    audios,
    threads,
    advance,
    skip,
    reason,
    tokenGate,
    audioGate,
    mints: () => mints,
    aborted: () => signal?.aborted === true,
    timers: () => timers.length,
  };
}

async function active(h: ReturnType<typeof setup>) {
  await h.ctl.start([]);
  first(h.sockets).options.onOpen?.();
}

describe("live call", () => {
  it("ignores a duplicate start", async () => {
    const h = setup();
    await h.ctl.start([]);
    await h.ctl.start([]);
    expect(h.mints()).toBe(1);
    expect(h.sockets.length).toBe(1);
    first(h.sockets).options.onOpen?.();
    await h.ctl.start([]);
    expect(h.mints()).toBe(1);
    expect(h.ctl.getSnapshot().phase).toBe("active");
  });

  it("closes late audio and opens no socket after hang-up", async () => {
    const h = setup({ manualToken: true, manualAudio: true });
    const started = h.ctl.start([]);
    h.ctl.end("hang-up");
    expect(h.aborted()).toBe(true);
    h.audioGate.resolve();
    h.tokenGate.resolve({ value: "token" });
    await started;
    await flush();
    expect(h.sockets.length).toBe(0);
    expect(h.audios.length).toBe(1);
    expect(first(h.audios).closed).toBe(1);
    expect(h.reason()).toBe("hang-up");
  });

  it("opens no socket when hang-up lands after audio is ready but before the token", async () => {
    const h = setup({ manualToken: true });
    const started = h.ctl.start([]);
    await flush();
    expect(h.audios.length).toBe(1);
    h.ctl.end("hang-up");
    h.tokenGate.resolve({ value: "token" });
    await started;
    await flush();
    expect(h.sockets.length).toBe(0);
    expect(first(h.audios).closed).toBe(1);
    expect(h.reason()).toBe("hang-up");
  });

  it("sends no mic audio while the call is still connecting", async () => {
    const h = setup();
    await h.ctl.start([]);
    expect(h.ctl.getSnapshot().phase).toBe("connecting");
    first(h.audios).options.onMicChunk(new Uint8Array(2));
    expect(first(h.sockets).socket.sentAudio).toBe(0);
    first(h.sockets).options.onOpen?.();
    first(h.audios).options.onMicChunk(new Uint8Array(2));
    expect(first(h.sockets).socket.sentAudio).toBe(1);
  });

  it("hang-up closes socket and audio and is idempotent", async () => {
    const h = setup();
    await active(h);
    h.ctl.end("hang-up");
    h.ctl.end("cap");
    expect(first(h.sockets).socket.closed).toBe(1);
    expect(first(h.audios).closed).toBe(1);
    expect(h.reason()).toBe("hang-up");
    expect(h.timers()).toBe(0);
  });

  it("arms the deadline before creating the socket", async () => {
    const h = setup();
    await h.ctl.start([]);
    expect(h.log.indexOf("timer")).toBeLessThan(h.log.indexOf("socket"));
    expect(h.log.indexOf("timer")).toBeGreaterThanOrEqual(0);
  });

  it("ends with cap after 600 s and sends nothing afterwards", async () => {
    const h = setup();
    await active(h);
    const { socket } = first(h.sockets);
    first(h.audios).options.onMicChunk(new Uint8Array(2));
    expect(socket.sentAudio).toBe(1);
    h.advance(callCapMs);
    expect(h.reason()).toBe("cap");
    expect(socket.closed).toBe(1);
    expect(first(h.audios).closed).toBe(1);
    first(h.audios).options.onMicChunk(new Uint8Array(2));
    expect(socket.sentAudio).toBe(1);
  });

  it("refuses I/O past the deadline even if the timer has not fired", async () => {
    const h = setup();
    await active(h);
    h.skip(callCapMs);
    first(h.audios).options.onMicChunk(new Uint8Array(2));
    expect(first(h.sockets).socket.sentAudio).toBe(0);
    expect(h.reason()).toBe("cap");
    expect(first(h.sockets).socket.closed).toBe(1);
  });

  // Each handler goes first once, so neither can hide behind the other ending the call.
  it.each(["audio", "event"] as const)(
    "refuses socket events and audio past 600 s when the timer has not fired (%s first)",
    async (firstHandler) => {
      expect(callCapMs).toBe(600_000);
      const h = setup();
      await active(h);
      const { socket, options } = first(h.sockets);
      const audio = first(h.audios);
      const chunk = {
        bytes: new Uint8Array(2),
        responseId: "r1",
        itemId: "i1",
      };
      options.onEvent?.({ type: "response.created", responseId: "r1" });
      options.onEvent?.({
        type: "response.output_item_added",
        responseId: "r1",
        itemId: "i1",
      });
      // One millisecond before the cap the call still plays audio.
      h.skip(599_999);
      options.onAudio?.(chunk);
      expect(audio.enqueued).toBe(1);
      expect(h.reason()).toBeUndefined();
      // At exactly 600_000 ms the timer is skipped, so only live(c) can stop I/O.
      h.skip(1);
      const late = () => options.onAudio?.(chunk);
      const lateEvent = () =>
        options.onEvent?.({
          type: "input.transcription_updated",
          itemId: "i2",
          text: "late",
        });
      if (firstHandler === "audio") {
        late();
        lateEvent();
      } else {
        lateEvent();
        late();
      }
      expect(h.reason()).toBe("cap");
      expect(audio.enqueued).toBe(1);
      expect(h.threads).toEqual([]);
      expect(socket.closed).toBe(1);
      expect(audio.closed).toBe(1);
      audio.options.onMicChunk(new Uint8Array(2));
      expect(socket.sentAudio).toBe(0);
      expect(socket.cancels).toBe(0);
      expect(socket.truncates).toEqual([]);
    },
  );

  it("ends with connection-lost when an active call drops", async () => {
    const h = setup();
    await active(h);
    first(h.sockets).options.onClose?.();
    expect(h.reason()).toBe("connection-lost");
    expect(first(h.sockets).socket.closed).toBe(1);
    expect(first(h.audios).closed).toBe(1);
  });

  it("ends with failed when the socket errors while connecting", async () => {
    const h = setup();
    await h.ctl.start([]);
    first(h.sockets).options.onError?.();
    expect(h.reason()).toBe("failed");
  });

  it("ends with failed when the token fetch rejects", async () => {
    const h = setup({ manualToken: true });
    const started = h.ctl.start([]);
    h.tokenGate.reject(new Error("no"));
    await started;
    expect(h.reason()).toBe("failed");
    expect(h.sockets.length).toBe(0);
    expect(first(h.audios).closed).toBe(1);
  });

  it("does not fail a replacement call when an earlier start rejects late", async () => {
    const h = setup({
      manualToken: true,
      manualAudio: true,
      gateFirstOnly: true,
    });
    const first1 = h.ctl.start([]);
    h.ctl.end("hang-up");
    await h.ctl.start([]);
    first(h.sockets).options.onOpen?.();
    expect(h.ctl.getSnapshot().phase).toBe("active");
    h.tokenGate.reject(new Error("late"));
    await first1;
    h.audioGate.resolve();
    await flush();
    expect(h.ctl.getSnapshot().phase).toBe("active");
    expect(h.reason()).toBeUndefined();
    expect(h.audios.length).toBe(2);
    // audios[0] is the replacement's; audios[1] is the first call's late audio.
    expect(h.audios[0]?.closed).toBe(0);
    expect(h.audios[1]?.closed).toBe(1);
    expect(first(h.sockets).socket.closed).toBe(0);
  });

  it("ignores stale events after end and after a new start", async () => {
    const h = setup();
    await active(h);
    const old = first(h.sockets);
    const oldAudio = first(h.audios);
    h.ctl.end("hang-up");
    await h.ctl.start([]);
    expect(h.mints()).toBe(2);
    expect(h.ctl.getSnapshot().phase).toBe("connecting");
    old.options.onOpen?.();
    old.options.onClose?.();
    old.options.onEvent({ type: "error", message: "x" });
    old.options.onAudio?.({
      bytes: new Uint8Array(2),
      responseId: "r1",
      itemId: "i1",
    });
    oldAudio.options.onMicChunk(new Uint8Array(2));
    expect(h.ctl.getSnapshot().phase).toBe("connecting");
    expect(old.socket.sentAudio).toBe(0);
    expect(old.socket.closed).toBe(1);
    expect(oldAudio.enqueued).toBe(0);
    h.advance(callCapMs);
    expect(h.reason()).toBe("cap");
  });

  it("ends with page-exit", async () => {
    const h = setup();
    await active(h);
    h.ctl.handlePageExit();
    expect(h.reason()).toBe("page-exit");
    expect(first(h.sockets).socket.closed).toBe(1);
  });

  it("routes mute through the audio adapter and the reducer", async () => {
    const h = setup();
    await active(h);
    h.ctl.setMuted(true);
    expect(first(h.audios).muted).toBe(true);
    expect(h.ctl.getSnapshot().muted).toBe(true);
  });

  it("flushes, cancels and truncates on barge-in", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({
      type: "response.output_item_added",
      responseId: "r1",
      itemId: "i1",
    });
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(first(h.audios).flushes).toBe(1);
    expect(socket.cancels).toBe(1);
    // BC-63: playedMs() says 420 and the reducer says "i1"; only the flush
    // snapshot may reach truncate.
    expect(first(h.audios).flushedWith).toEqual([1]);
    expect(socket.truncates).toEqual([["snap-item", 77]]);
  });

  it("truncates untagged binary audio with the announced item (BC-63)", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    options.onEvent({ type: "response.created", responseId: "r1" });
    // Binary frame: no response id, no item id. Queued before the announce.
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: undefined, itemId: undefined });
    expect(audio.enqueued).toBe(1);
    options.onEvent({
      type: "response.output_item_added",
      responseId: "r1",
      itemId: "i1",
    });
    // The flush snapshot played untagged audio of r1, so it has no item id.
    audio.snapshot = { generation: 0, responseId: "r1", itemId: undefined, playedMs: 91 };
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.truncates).toEqual([["i1", 91]]);
  });

  it("does not invent an item id before one is announced", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: undefined, itemId: undefined });
    audio.snapshot = { generation: 0, responseId: "r1", itemId: undefined, playedMs: 91 };
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.truncates).toEqual([]);
  });

  it("forwards keyed transcripts only while the call is live", async () => {
    const h = setup();
    await active(h);
    const { options } = first(h.sockets);
    options.onEvent({
      type: "input.transcription_updated",
      itemId: "t1",
      text: "a",
    });
    options.onEvent({
      type: "input.transcription_completed",
      itemId: "t1",
      text: "ab",
    });
    options.onEvent({
      type: "input.transcription_updated",
      itemId: undefined,
      text: "x",
    });
    expect(h.threads.map((e) => [e.itemId, e.final])).toEqual([
      ["t1", false],
      ["t1", true],
    ]);
    expect(h.threads[1]?.text === "ab").toBe(true);
    h.ctl.end("hang-up");
    options.onEvent({
      type: "input.transcription_updated",
      itemId: "t2",
      text: "z",
    });
    expect(h.threads.length).toBe(2);
  });

  // BC-63: JSON chunks must pass the reducer's identity check, not just get an id.
  describe("audio enqueue identity", () => {
    const rows: {
      name: string;
      events: ("created" | "item" | "cancelled")[];
      chunk: { responseId: string | undefined; itemId: string | undefined };
      enqueued: number;
    }[] = [
      { name: "missing response", events: [], chunk: { responseId: "r1", itemId: "i1" }, enqueued: 0 },
      {
        name: "cancelled response",
        events: ["created", "item", "cancelled"],
        chunk: { responseId: "r1", itemId: "i1" },
        enqueued: 0,
      },
      {
        name: "mismatched item",
        events: ["created", "item"],
        chunk: { responseId: "r1", itemId: "other" },
        enqueued: 0,
      },
      {
        name: "valid JSON chunk",
        events: ["created", "item"],
        chunk: { responseId: "r1", itemId: "i1" },
        enqueued: 1,
      },
      {
        name: "binary chunk of the generating response",
        events: ["created", "item"],
        chunk: { responseId: undefined, itemId: undefined },
        enqueued: 1,
      },
    ];
    it.each(rows)("$name", async ({ events, chunk, enqueued }) => {
      const h = setup();
      await active(h);
      const { options } = first(h.sockets);
      if (events.includes("created")) {
        options.onEvent?.({ type: "response.created", responseId: "r1" });
      }
      if (events.includes("item")) {
        options.onEvent?.({
          type: "response.output_item_added",
          responseId: "r1",
          itemId: "i1",
        });
      }
      if (events.includes("cancelled")) {
        options.onEvent?.({ type: "response.cancelled", responseId: "r1" });
      }
      options.onAudio?.({ bytes: new Uint8Array(2), ...chunk });
      expect(first(h.audios).enqueued).toBe(enqueued);
    });
  });
  // The cap timer stays pending: the clock moves with skip, never advance.
  describe("deadline passed, timer still pending", () => {
    const quietSockets = (h: ReturnType<typeof setup>) => {
      for (const { socket } of h.sockets) {
        expect(socket.sentAudio).toBe(0);
        expect(socket.cancels).toBe(0);
        expect(socket.truncates).toHaveLength(0);
        expect(socket.closed).toBe(1);
      }
    };
    const capped = (h: ReturnType<typeof setup>) => {
      expect(h.reason()).toBe("cap");
      expect(h.aborted()).toBe(true);
      for (const a of h.audios) {
        expect(a.closed).toBe(1);
        expect(a.muted).toBeUndefined();
      }
      quietSockets(h);
    };

    it("mic chunk while still connecting", async () => {
      const h = setup();
      await h.ctl.start([]);
      expect(h.ctl.getSnapshot().phase).toBe("connecting");
      expect(h.timers()).toBe(1);
      h.skip(callCapMs);
      first(h.audios).options.onMicChunk(new Uint8Array(2));
      capped(h);
      expect(h.sockets).toHaveLength(1);
    });

    it("audio resolves late while the mint is pending", async () => {
      const h = setup({ manualToken: true, manualAudio: true });
      const started = h.ctl.start([]);
      h.skip(callCapMs);
      h.audioGate.resolve();
      await flush();
      expect(h.reason()).toBe("cap");
      h.tokenGate.resolve({ value: "token" });
      await started;
      expect(h.sockets).toHaveLength(0);
      capped(h);
      expect(h.audios).toHaveLength(1);
    });

    it("mint completes late after audio is ready", async () => {
      const h = setup({ manualToken: true });
      const started = h.ctl.start([]);
      await flush();
      h.skip(callCapMs);
      h.tokenGate.resolve({ value: "token" });
      await started;
      expect(h.sockets).toHaveLength(0);
      capped(h);
      expect(h.audios).toHaveLength(1);
    });

    it("audio resolves late after the mint", async () => {
      const h = setup({ manualAudio: true });
      const started = h.ctl.start([]);
      await flush();
      h.skip(callCapMs);
      h.audioGate.resolve();
      await started;
      expect(h.sockets).toHaveLength(0);
      capped(h);
      expect(h.audios).toHaveLength(1);
    });

    it("playback notice", async () => {
      const h = setup();
      await active(h);
      h.skip(callCapMs);
      first(h.audios).options.onPlayback({ type: "playbackDrained", generation: 0 });
      capped(h);
    });

    it("setMuted", async () => {
      const h = setup();
      await active(h);
      h.skip(callCapMs);
      h.ctl.setMuted(true);
      capped(h);
    });

    it("late mint rejection", async () => {
      const h = setup({ manualToken: true });
      const started = h.ctl.start([]);
      await flush();
      h.skip(callCapMs);
      h.tokenGate.reject(new Error("mint"));
      await started;
      expect(h.sockets).toHaveLength(0);
      capped(h);
    });

    it("late audio rejection", async () => {
      const h = setup({ manualToken: true, manualAudio: true });
      const started = h.ctl.start([]);
      h.skip(callCapMs);
      h.audioGate.reject(new Error("audio"));
      h.tokenGate.resolve({ value: "token" });
      await started;
      expect(h.sockets).toHaveLength(0);
      expect(h.reason()).toBe("cap");
      expect(h.aborted()).toBe(true);
    });

    it("a rejection before the deadline still fails", async () => {
      const h = setup({ manualToken: true });
      const started = h.ctl.start([]);
      h.tokenGate.reject(new Error("mint"));
      await started;
      expect(h.reason()).toBe("failed");
    });

    it("socket opens after the deadline: no handshake", async () => {
      const h = setup();
      await h.ctl.start([]);
      h.skip(callCapMs);
      const { options } = first(h.sockets);
      // The adapter sends session.update only when this allows it.
      expect(options.canHandshake?.()).toBe(false);
      options.onOpen?.();
      capped(h);
      expect(h.ctl.getSnapshot().phase).toBe("ended");
    });

    it("allows the handshake before the deadline", async () => {
      const h = setup();
      await h.ctl.start([]);
      h.skip(callCapMs - 1);
      expect(first(h.sockets).options.canHandshake?.()).toBe(true);
      expect(h.reason()).toBeUndefined();
    });
  });
});
