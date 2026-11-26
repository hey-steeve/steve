import { describe, expect, it } from "vitest";
import type { VoiceTuning } from "@steve/voice";
import type {
  BrowserAudio,
  BrowserAudioOptions,
  FlushSnapshot,
} from "./browser-audio";
import type { RealtimeSocket, RealtimeSocketOptions } from "./realtime-socket";
import { consultGuidance, needInfoGuidance } from "@steve/triage";
import { forcedSentences } from "./voice-safety";
import {
  callCapMs,
  createLiveCall,
  type CallDeps,
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
    triage?: CallDeps["triage"];
    enqueueThrows?: boolean;
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
    forced: (readonly string[])[] = [];
    instructions: string[] = [];
    forceMessage(sentences: readonly string[]) {
      this.forced.push(sentences);
    }
    updateInstructions(text: string) {
      this.instructions.push(text);
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
    generation = 0;
    setMuted(m: boolean) {
      this.muted = m;
    }
    enqueued = 0;
    chunks: { responseId: string; itemId: string | undefined; length: number }[] = [];
    enqueue(chunk: { bytes: Uint8Array; responseId: string; itemId: string | undefined }) {
      if (opts.enqueueThrows) throw new Error("tts down");
      // `enqueued` counts audible audio; announce chunks are zero-length.
      if (chunk.bytes.length > 0) this.enqueued++;
      this.chunks.push({
        responseId: chunk.responseId,
        itemId: chunk.itemId,
        length: chunk.bytes.length,
      });
    }
    discarded: string[] = [];
    discardResponse(id: string) {
      this.discarded.push(id);
    }
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
      this.generation = next ?? this.generation + 1;
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
    ...(opts.triage ? { triage: opts.triage } : {}),
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
    // The announce reaches the adapter as a zero-length chunk that carries
    // the id, so the queued untagged audio can adopt it.
    expect(audio.chunks[1]).toEqual({ responseId: "r1", itemId: "i1", length: 0 });
    // The adapter adopted the id: the flush snapshot names the item.
    audio.snapshot = { generation: 0, responseId: "r1", itemId: "i1", playedMs: 91 };
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.truncates).toEqual([["i1", 91]]);
  });

  it("keeps binary audio speaking after response.done so barge-in flushes (BC-63)", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: undefined, itemId: undefined });
    options.onEvent({ type: "response.output_item_added", responseId: "r1", itemId: "i1" });
    // response.done lands before the adapter's first playback tick.
    options.onEvent({ type: "response.done", responseId: "r1" });
    expect(h.ctl.getSnapshot().activity).toBe("speaking");
    audio.snapshot = { generation: 0, responseId: "r1", itemId: "i1", playedMs: 64 };
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(audio.flushes).toBe(1);
    expect(socket.truncates).toEqual([["i1", 64]]);
  });

  it("does not truncate on speech after response.done with no audio queued", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.output_item_added", responseId: "r1", itemId: "i1" });
    options.onEvent({ type: "response.done", responseId: "r1" });
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(first(h.audios).flushes).toBe(0);
    expect(socket.truncates).toEqual([]);
  });

  it("truncates R1's audible item when R2 is announced first (BC-63)", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.output_item_added", responseId: "r1", itemId: "i1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: undefined, itemId: undefined });
    options.onEvent({ type: "response.created", responseId: "r2" });
    options.onEvent({ type: "response.output_item_added", responseId: "r2", itemId: "i2" });
    // R1 is still what the speaker plays.
    audio.snapshot = { generation: 0, responseId: "r1", itemId: "i1", playedMs: 55 };
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.truncates).toEqual([["i1", 55]]);
  });

  it("never sends a later item with the audible item's offset (BC-63)", async () => {
    const h = setup();
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.output_item_added", responseId: "r1", itemId: "i1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: undefined, itemId: undefined });
    options.onEvent({ type: "response.output_item_added", responseId: "r1", itemId: "i2" });
    audio.snapshot = { generation: 0, responseId: "r1", itemId: "i1", playedMs: 33 };
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.truncates).toEqual([["i1", 33]]);
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
    const transcripts = h.threads.filter((e) => e.type === "transcript");
    expect(transcripts.map((e) => [e.itemId, e.final])).toEqual([
      ["t1", false],
      ["t1", true],
    ]);
    expect(transcripts[1]?.text === "ab").toBe(true);
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
        name: "JSON chunk with item id and no response id",
        events: ["created", "item"],
        chunk: { responseId: undefined, itemId: "i1" },
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

    it("mute while still connecting", async () => {
      const h = setup();
      await h.ctl.start([]);
      expect(h.ctl.getSnapshot().phase).toBe("connecting");
      h.skip(callCapMs);
      h.ctl.setMuted(true);
      capped(h);
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

describe("live call triage enforcement", () => {
  type Decision = NonNullable<Awaited<ReturnType<NonNullable<CallDeps["triage"]>>>>;
  const c15 = { type: "call", number: "15" } as const;
  const c3114 = { type: "call", number: "3114" } as const;
  const emergency15: Decision = { label: "emergency", calls: [c15] };

  // Triage stub: every request waits for the test to answer it.
  function gated() {
    const requests: {
      current: { turnId: string; sessionId: string; text: string };
      previous: readonly { text: string }[];
      decisions: readonly { turnId: string; label: string }[] | undefined;
      signal: AbortSignal;
      answer: (d: Decision | null) => void;
    }[] = [];
    const triage: CallDeps["triage"] = (current, previous, signal, decisions) =>
      new Promise((resolve) => {
        requests.push({ current, previous, decisions, signal, answer: resolve });
      });
    return { requests, triage };
  }
  const say = (h: ReturnType<typeof setup>, itemId: string, text: string) =>
    first(h.sockets).options.onEvent({ type: "input.transcription_completed", itemId, text });
  const emergencies = (h: ReturnType<typeof setup>) => h.threads.filter((e) => e.type === "emergency");

  it("triages one finalized item once, with preceding patient turns in order", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await h.ctl.start([
      { role: "user", content: "h1" },
      { role: "assistant", content: "a" },
      { role: "user", content: "h2" },
    ]);
    first(h.sockets).options.onOpen?.();
    say(h, "t1", "first");
    first(h.sockets).options.onEvent({ type: "input.transcription_updated", itemId: "t2", text: "x" });
    say(h, "t1", "first");
    say(h, "t2", "second");
    await flush();
    expect(g.requests.map((r) => r.current.turnId)).toEqual(["t1", "t2"]);
    expect(g.requests[0]?.previous.map((t) => t.text)).toEqual(["h1", "h2"]);
    expect(g.requests[1]?.previous.map((t) => t.text)).toEqual(["h1", "h2", "first"]);
    expect(new Set(g.requests.map((r) => r.current.sessionId)).size).toBe(1);
  });

  it("sends recorded labels by turnId with the next triage request", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await h.ctl.start([{ role: "user", content: "h1" }]);
    first(h.sockets).options.onOpen?.();
    say(h, "t1", "first");
    await flush();
    expect(g.requests[0]?.decisions).toEqual([]);
    g.requests[0]?.answer(emergency15);
    await flush();
    say(h, "t2", "second");
    await flush();
    expect(g.requests[1]?.decisions).toEqual([{ turnId: "t1", label: "emergency" }]);
  });

  it("skips triage when the port is omitted", async () => {
    const h = setup();
    await active(h);
    say(h, "t1", "mal au coeur");
    await flush();
    expect(first(h.sockets).socket.forced).toEqual([]);
  });

  it("ignores a result after end()", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    say(h, "t1", "x");
    h.ctl.end("hang-up");
    g.requests[0]?.answer(emergency15);
    await flush();
    const { socket } = first(h.sockets);
    expect(socket.forced).toEqual([]);
    expect(socket.instructions).toEqual([]);
    expect(emergencies(h)).toEqual([]);
  });

  it("late emergency: cancels in flight, flushes, forces the exact sentences", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "douleur poitrine");
    // Another turn and a response have started before the result lands.
    say(h, "t2", "et puis");
    options.onEvent({ type: "response.created", responseId: "r1" });
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(socket.cancels).toBe(1);
    expect(audio.flushes).toBe(1);
    expect(audio.discarded).toEqual(["r1"]);
    expect(socket.forced).toEqual([[...forcedSentences([c15])]]);
    expect(emergencies(h)).toEqual([
      { type: "emergency", itemId: "t1", calls: [c15], sentences: forcedSentences([c15]) },
    ]);
  });

  it("queues a second emergency until the forced playback drains", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(socket.forced).toEqual([[...forcedSentences([c15])]]);
    // The forced message is now speaking.
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    const flushes = audio.flushes;
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    expect(emergencies(h).map((e) => e.itemId)).toEqual(["t1", "t2"]);
    expect(socket.forced).toEqual([[...forcedSentences([c15])]]);
    expect(audio.flushes).toBe(flushes);
    expect(socket.cancels).toBe(0);
    expect(audio.discarded).toEqual([]);
    // The pre-force flush retired generation 0: that drain is stale.
    audio.options.onPlayback({ type: "playbackDrained", generation: 0 });
    options.onEvent({ type: "response.done", responseId: "f1" });
    expect(socket.forced).toHaveLength(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: audio.generation });
    expect(socket.forced).toEqual([[...forcedSentences([c15])], [...forcedSentences([c3114])]]);
    expect(audio.flushes).toBe(flushes);
    expect(socket.cancels).toBe(0);
  });

  it("does not let an ordinary response claim the forced slot", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    // r0 already ended; r1 is still in flight when the emergency lands.
    options.onEvent({ type: "response.created", responseId: "r0" });
    options.onEvent({ type: "response.done", responseId: "r0" });
    say(h, "t1", "douleur poitrine");
    options.onEvent({ type: "response.created", responseId: "r1" });
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(socket.forced).toHaveLength(1);
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    // Late events of ordinary responses must not settle or stall the queue.
    options.onEvent({ type: "response.created", responseId: "r0" });
    options.onEvent({ type: "response.done", responseId: "r0" });
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.cancelled", responseId: "r1" });
    options.onEvent({ type: "response.done", responseId: "r1" });
    expect(socket.forced).toHaveLength(1);
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    options.onEvent({ type: "response.done", responseId: "f1" });
    expect(socket.forced).toHaveLength(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: audio.generation });
    expect(socket.forced).toEqual([[...forcedSentences([c15])], [...forcedSentences([c3114])]]);
  });

  it("does not let a new ordinary response claim the forced slot", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    expect(socket.forced).toHaveLength(1);
    // An automatic response created after the force, with no forced audio.
    options.onEvent({ type: "response.created", responseId: "vad1" });
    options.onEvent({ type: "response.done", responseId: "vad1" });
    expect(socket.forced).toHaveLength(1);
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    options.onEvent({ type: "response.done", responseId: "f1" });
    expect(socket.forced).toHaveLength(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: audio.generation });
    expect(socket.forced).toEqual([[...forcedSentences([c15])], [...forcedSentences([c3114])]]);
  });

  it("does not flush, cancel or truncate a forced emergency on speech_started", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    options.onEvent({ type: "response.done", responseId: "f1" });
    const flushes = audio.flushes;
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    await flush();
    expect(audio.flushes).toBe(flushes);
    expect(socket.cancels).toBe(0);
    expect(socket.truncates).toEqual([]);
    expect(audio.discarded).toEqual([]);
    // Still playing: a second emergency stays queued until the forced drain.
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    expect(socket.forced).toHaveLength(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: audio.generation });
    expect(socket.forced).toHaveLength(2);
  });

  it("keeps both forced chunks playing when speech_started lands mid-playback", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    const flushes = audio.flushes;
    options.onEvent({ type: "input.speech_started", itemId: "t2" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    await flush();
    // Neither chunk was flushed or dropped by a barge-in.
    expect(audio.enqueued).toBe(2);
    expect(audio.flushes).toBe(flushes);
    expect(audio.discarded).toEqual([]);
    expect(socket.cancels).toBe(0);
    expect(socket.truncates).toEqual([]);
    // Still treated as playing: a second emergency waits for the forced drain.
    say(h, "t3", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    options.onEvent({ type: "response.done", responseId: "f1" });
    expect(socket.forced).toHaveLength(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: audio.generation });
    expect(socket.forced).toHaveLength(2);
  });

  it("releases the queue on the forced audio's own generation after the pre-force flush", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "douleur poitrine");
    options.onEvent({ type: "response.created", responseId: "r1" });
    g.requests[0]?.answer(emergency15);
    await flush();
    // The pre-force flush retired generation 0; forced audio plays under 1.
    expect(audio.generation).toBe(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: 0 });
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "f1", itemId: undefined });
    audio.options.onPlayback({
      type: "playbackStarted",
      responseId: "f1",
      itemId: undefined,
      generation: 1,
    });
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    expect(emergencies(h).map((e) => e.itemId)).toEqual(["t1", "t2"]);
    expect(socket.forced).toHaveLength(1);
    // Stale drains: old generation, then a stale cancelled response's done.
    audio.options.onPlayback({ type: "playbackDrained", generation: 0 });
    options.onEvent({ type: "response.done", responseId: "r1" });
    audio.options.onPlayback({ type: "playbackDrained", generation: 0 });
    expect(socket.forced).toHaveLength(1);
    // done without the drain of its own generation: still held.
    options.onEvent({ type: "response.done", responseId: "f1" });
    expect(socket.forced).toHaveLength(1);
    audio.options.onPlayback({ type: "playbackDrained", generation: 1 });
    expect(socket.forced).toEqual([[...forcedSentences([c15])], [...forcedSentences([c3114])]]);
  });

  it("frees the queue when forceMessage throws", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { socket } = first(h.sockets);
    let attempts = 0;
    socket.forceMessage = () => {
      attempts++;
      throw new Error("send failed");
    };
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    expect(emergencies(h).map((e) => e.itemId)).toEqual(["t1", "t2"]);
    expect(attempts).toBe(2);
  });

  it("frees the queue on a server error with no forced response", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    expect(socket.forced).toHaveLength(1);
    options.onEvent({ type: "error", message: "rejected" });
    expect(emergencies(h).map((e) => e.itemId)).toEqual(["t1", "t2"]);
    expect(socket.forced).toHaveLength(2);
  });

  it("frees the queue when the forced response ends with no audio", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    say(h, "t1", "douleur poitrine");
    g.requests[0]?.answer(emergency15);
    await flush();
    say(h, "t2", "suicidaire");
    g.requests[1]?.answer({ label: "emergency", calls: [c3114] });
    await flush();
    options.onEvent({ type: "response.created", responseId: "f1" });
    options.onEvent({ type: "response.done", responseId: "f1" });
    // A silent created/done alone must not release early.
    expect(socket.forced).toHaveLength(1);
    h.advance(5_000);
    expect(socket.forced).toHaveLength(2);
    expect(emergencies(h).map((e) => e.itemId)).toEqual(["t1", "t2"]);
  });

  it("does not cancel when no response is in flight", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    say(h, "t1", "x");
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(first(h.sockets).socket.cancels).toBe(0);
    expect(first(h.sockets).socket.forced.length).toBe(1);
  });

  it.each<[string, Decision & { label: "emergency" }]>([
    ["15", { label: "emergency", calls: [c15] }],
    ["3114", { label: "emergency", calls: [c3114] }],
    ["3114 then 15", { label: "emergency", calls: [c3114, c15] }],
    ["15 then 3114", { label: "emergency", calls: [c15, c3114] }],
  ])("forces the shared sentences for %s", async (_n, decision) => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    say(h, "t1", "x");
    g.requests[0]?.answer(decision);
    await flush();
    const expected = [...forcedSentences(decision.calls)];
    expect(first(h.sockets).socket.forced).toEqual([expected]);
    expect(emergencies(h).map((e) => (e.type === "emergency" ? [...e.sentences] : []))).toEqual([expected]);
  });

  it("drops cancelled-response chunks and keeps forced-response audio", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options } = first(h.sockets);
    const audio = first(h.audios);
    say(h, "t1", "x");
    options.onEvent({ type: "response.created", responseId: "r1" });
    g.requests[0]?.answer(emergency15);
    await flush();
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: undefined, itemId: undefined });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "r1", itemId: undefined });
    expect(audio.enqueued).toBe(0);
    options.onEvent({ type: "response.created", responseId: "r2" });
    options.onAudio?.({ bytes: new Uint8Array(2), responseId: "r2", itemId: undefined });
    expect(audio.enqueued).toBe(1);
  });

  it("does not force twice for the same item", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    say(h, "t1", "x");
    say(h, "t1", "x");
    g.requests[0]?.answer(emergency15);
    await flush();
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(first(h.sockets).socket.forced.length).toBe(1);
    expect(emergencies(h).length).toBe(1);
  });

  it("applies guidance to one response, then restores the base", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    say(h, "t1", "x");
    g.requests[0]?.answer({ label: "consult", guidance: consultGuidance });
    await flush();
    expect(socket.instructions).toEqual([`base\n\n${consultGuidance.text}`]);
    expect(socket.forced).toEqual([]);
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.done", responseId: "r1" });
    expect(socket.instructions[1]).toBe("base");
    say(h, "t2", "y");
    g.requests[1]?.answer({ label: "need-info" });
    await flush();
    expect(socket.instructions[2]).toBe(`base\n\n${needInfoGuidance.text}`);
    // A later user turn restores before it can inherit.
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.instructions[3]).toBe("base");
    expect(socket.instructions.length).toBe(4);
  });

  it("drops consult guidance that lands after its response finished", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    say(h, "t1", "x");
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.done", responseId: "r1" });
    g.requests[0]?.answer({ label: "consult", guidance: consultGuidance });
    await flush();
    expect(socket.instructions).toEqual([]);
    say(h, "t2", "y");
    options.onEvent({ type: "response.created", responseId: "r2" });
    expect(socket.instructions).toEqual([]);
  });

  it("drops a consult when the response finished before the transcript was final", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    options.onEvent({ type: "input.speech_stopped", itemId: "t1" });
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "response.done", responseId: "r1" });
    say(h, "t1", "x");
    g.requests[0]?.answer({ label: "consult", guidance: consultGuidance });
    await flush();
    expect(socket.instructions).toEqual([]);
  });

  it("drops a consult that arrives after the next speech started", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    say(h, "t1", "x");
    options.onEvent({ type: "response.created", responseId: "r1" });
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    g.requests[0]?.answer({ label: "consult", guidance: consultGuidance });
    await flush();
    expect(socket.instructions).toEqual([]);
  });

  it("ignores a stale response.done for another item and restores on speech", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    const { options, socket } = first(h.sockets);
    say(h, "t1", "x");
    options.onEvent({ type: "response.created", responseId: "r1" });
    say(h, "t2", "y");
    options.onEvent({ type: "response.created", responseId: "r2" });
    g.requests[1]?.answer({ label: "consult", guidance: consultGuidance });
    await flush();
    expect(socket.instructions).toEqual([`base\n\n${consultGuidance.text}`]);
    options.onEvent({ type: "response.done", responseId: "r1" });
    expect(socket.instructions.length).toBe(1);
    options.onEvent({ type: "input.speech_started", itemId: undefined });
    expect(socket.instructions[1]).toBe("base");
    options.onEvent({ type: "response.done", responseId: "r2" });
    expect(socket.instructions.length).toBe(2);
  });

  it("emits a non-forcing offer for non-emergency calls", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    say(h, "t1", "x");
    g.requests[0]?.answer({ label: "self-care", calls: [c3114] });
    await flush();
    expect(h.threads.filter((e) => e.type === "offer")).toEqual([
      { type: "offer", itemId: "t1", calls: [c3114] },
    ]);
    expect(first(h.sockets).socket.forced).toEqual([]);
  });

  it("still emits the emergency event when audio fails", async () => {
    const g = gated();
    const h = setup({ triage: g.triage, enqueueThrows: true });
    await active(h);
    say(h, "t1", "x");
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(emergencies(h).length).toBe(1);
  });

  it("sends no triage and no force past the cap", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    h.skip(callCapMs + 1);
    say(h, "t1", "x");
    await flush();
    expect(g.requests).toEqual([]);
    expect(first(h.sockets).socket.forced).toEqual([]);
  });

  it("ignores a result that lands after the cap", async () => {
    const g = gated();
    const h = setup({ triage: g.triage });
    await active(h);
    say(h, "t1", "x");
    h.skip(callCapMs + 1);
    g.requests[0]?.answer(emergency15);
    await flush();
    expect(first(h.sockets).socket.forced).toEqual([]);
    expect(emergencies(h)).toEqual([]);
  });
});
