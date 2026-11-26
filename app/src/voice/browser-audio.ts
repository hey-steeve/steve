import {
  decodePcm16,
  encodePcm16,
  type CallEvent,
  type VoiceTuning,
} from "@steve/voice";

export const SAMPLE_RATE = 24000;
export const WORKLET_URL = "/voice/capture.worklet.js";
const TICK_MS = 50;
// Scheduling lead for a queue that was empty.
const LEAD_SECONDS = 0.03;

// Codec port. PCM16 is built in. Opus needs an injected implementation.
export type CodecPort = {
  encode(s: Float32Array): Uint8Array;
  decode(b: Uint8Array): Float32Array;
};

export class OpusUnavailableError extends Error {
  constructor() {
    super("opus codec selected without an injected codec port");
    this.name = "OpusUnavailableError";
  }
}

// The subset of Web Audio this adapter uses.
export type NodeLike = { connect(to: NodeLike): unknown; disconnect(): void };
export type SourceLike = Pick<NodeLike, "connect"> & {
  buffer: unknown;
  start(w: number): void;
  stop(): void;
};
export type CaptureNodeLike = NodeLike & {
  port: {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage(m: unknown): void;
  };
};
export type ContextLike = {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly destination: NodeLike;
  createMediaStreamSource(stream: StreamLike): NodeLike;
  createGain(): NodeLike & { readonly gain: { value: number } };
  createBuffer(
    ch: number,
    n: number,
    rate: number,
  ): { copyToChannel(d: Float32Array, c: number): void };
  createBufferSource(): SourceLike;
  resume(): Promise<void>;
  close(): Promise<void>;
};
export type StreamLike = { getTracks(): readonly { stop(): void }[] };

export type AudioDeps = {
  readonly createContext: () => ContextLike;
  readonly getUserMedia: () => Promise<StreamLike>;
  // Loads the capture worklet into the created context and returns its node.
  readonly loadWorklet: () => Promise<CaptureNodeLike>;
  readonly clock: {
    setInterval(cb: () => void, ms: number): number;
    clearInterval(h: number): void;
  };
};

function browserDeps(): AudioDeps {
  let real: AudioContext | undefined;
  return {
    createContext: () => (real = new AudioContext({ sampleRate: SAMPLE_RATE })),
    getUserMedia: () =>
      navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      }),
    loadWorklet: async () => {
      if (real === undefined) throw new Error("audio context not created");
      await real.audioWorklet.addModule(WORKLET_URL);
      return new AudioWorkletNode(real, "steve-capture");
    },
    clock: {
      setInterval: (cb, ms) => window.setInterval(cb, ms),
      clearInterval: (h) => window.clearInterval(h),
    },
  };
}

export type PlaybackNotice = Extract<
  CallEvent,
  { type: "playbackStarted" | "playback" | "playbackDrained" }
>;

export type PlaybackChunk = {
  bytes: Uint8Array;
  responseId: string;
  itemId: string | undefined;
};

export type FlushSnapshot = {
  readonly generation: number;
  readonly responseId: string | undefined;
  readonly itemId: string | undefined;
  readonly playedMs: number;
};

export type BrowserAudioOptions = {
  readonly codec: VoiceTuning["codec"];
  readonly onMicChunk: (bytes: Uint8Array) => void;
  readonly onPlayback: (notice: PlaybackNotice) => void;
  readonly opus?: CodecPort;
  readonly deps?: AudioDeps;
};

export type BrowserAudio = {
  // Playback generation. A flush retires it.
  readonly generation: number;
  setMuted(muted: boolean): void;
  enqueue(chunk: PlaybackChunk): void;
  // Drops audio still to come from a response the server is cancelling.
  discardResponse(responseId: string): void;
  // Played offset of the audible item. Used by tick notices only.
  playedMs(): number;
  // Barge-in. One clock read builds the id and offset pair, then teardown
  // runs. Callers must use only this snapshot to truncate.
  flush(nextGeneration?: number): FlushSnapshot;
  close(): void;
};

type Item = { readonly responseId: string; itemId: string | undefined };
type Entry = Item & {
  readonly source: SourceLike;
  readonly start: number;
  readonly end: number;
};

const quiet = (fn: () => void): void => {
  try {
    fn();
  } catch {
    // Already stopped or disconnected.
  }
};

// Entries carry the item they were assigned at enqueue, so equality is exact.
const bankKey = (i: Item): string =>
  `${i.responseId.length}:${i.responseId}|${i.itemId === undefined ? "-" : `+${i.itemId}`}`;

const sameItem = (a: Item, b: Item): boolean =>
  a.responseId === b.responseId && a.itemId === b.itemId;

export async function startBrowserAudio(
  options: BrowserAudioOptions,
): Promise<BrowserAudio> {
  let codec: CodecPort = { encode: encodePcm16, decode: decodePcm16 };
  if (options.codec === "opus") {
    if (options.opus === undefined) throw new OpusUnavailableError();
    codec = options.opus;
  }
  const deps = options.deps ?? browserDeps();
  const stream = await deps.getUserMedia();

  let closed = false;
  let muted = false;
  // Bumped on every mute transition. Frames tagged with an older one are stale.
  let muteGen = 0;
  let generation = 0;
  // Bumped by flush and close so a tick can tell a callback retired its queue.
  let epoch = 0;
  let entries: Entry[] = [];
  let nextStart = 0;
  // Item announced to the caller since the last flush or drain.
  let current: Item | undefined;
  let announced = false;
  // Seconds already played per response and item in queues that drained. Kept
  // until the generation is flushed, so switching items never erases a bank.
  const banks = new Map<string, number>();
  // Last item id seen per response. An omitted id attaches to it at enqueue.
  const knownItem = new Map<string, string>();
  let ticker: number | undefined;
  // Responses retired by a flush or by the caller. `seen` feeds the next flush.
  const blocked = new Set<string>();
  const seen = new Set<string>();
  const nodes: NodeLike[] = [];
  let capture: CaptureNodeLike | undefined;
  let context: ContextLike | undefined;

  const stopPlayback = (): void => {
    if (ticker !== undefined) deps.clock.clearInterval(ticker);
    ticker = undefined;
    for (const { source } of entries) quiet(() => source.stop());
    entries = [];
    nextStart = 0;
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    epoch += 1;
    stopPlayback();
    if (capture) capture.port.onmessage = null;
    for (const node of nodes) quiet(() => node.disconnect());
    for (const track of stream.getTracks()) track.stop();
    context?.close().catch(() => undefined);
  };

  const queued = (e: Entry, at: number): number =>
    Math.max(0, Math.min(at, e.end) - e.start);
  // Item audible at the audio clock `at`: the last scheduled entry that has
  // started. Before any entry starts (or after a drain) it is the last announced.
  const audibleAt = (at: number): Item | undefined => {
    let found: Item | undefined;
    for (const e of entries) if (e.start <= at) found = e;
    return found ?? current;
  };
  const playedSeconds = (item: Item, at: number): number => {
    let seconds = banks.get(bankKey(item)) ?? 0;
    for (const e of entries) if (sameItem(e, item)) seconds += queued(e, at);
    return seconds;
  };
  // One clock read: the audible item and its offset belong together.
  const snapshotAt = (at: number): FlushSnapshot => {
    const item = audibleAt(at);
    return {
      generation,
      responseId: item?.responseId,
      itemId: item?.itemId,
      playedMs:
        item === undefined ? 0 : Math.round(playedSeconds(item, at) * 1000),
    };
  };
  const playedAt = (at: number): number => snapshotAt(at).playedMs;

  const tick = (): void => {
    if (closed || context === undefined) return;
    const now = context.currentTime;
    const startedEpoch = epoch;
    const audible = entries.some((e) => e.start <= now)
      ? audibleAt(now)
      : undefined;
    if (audible) {
      if (current === undefined || !sameItem(current, audible)) {
        current = { responseId: audible.responseId, itemId: audible.itemId };
        announced = false;
      }
      if (!announced) {
        announced = true;
        options.onPlayback({ type: "playbackStarted", ...current, generation });
        if (epoch !== startedEpoch) return;
      }
      options.onPlayback({
        type: "playback",
        playedMs: playedAt(now),
        generation,
      });
      if (epoch !== startedEpoch) return;
    }
    if (nextStart > 0 && now >= nextStart) {
      announced = false;
      for (const e of entries) {
        const key = bankKey(e);
        banks.set(key, (banks.get(key) ?? 0) + queued(e, now));
      }
      stopPlayback();
      options.onPlayback({ type: "playbackDrained", generation });
    }
  };

  const onCaptureMessage = ({ data }: MessageEvent): void => {
    if (closed || muted) return;
    if (typeof data !== "object" || data === null) return;
    const gen = Reflect.get(data, "gen");
    const samples = Reflect.get(data, "samples");
    if (gen !== muteGen || !(samples instanceof Float32Array)) return;
    const startedEpoch = epoch;
    const bytes = codec.encode(samples);
    if (closed || muted || gen !== muteGen || epoch !== startedEpoch) return;
    options.onMicChunk(bytes);
  };

  try {
    context = deps.createContext();
    if (context.sampleRate !== SAMPLE_RATE && options.codec === "pcm16-24k") {
      throw new Error(
        `audio context runs at ${context.sampleRate} Hz, expected ${SAMPLE_RATE}`,
      );
    }
    await context.resume();
    capture = await deps.loadWorklet();
    const mic = context.createMediaStreamSource(stream);
    const silent = context.createGain();
    silent.gain.value = 0;
    nodes.push(mic, capture, silent);
    mic.connect(capture);
    // Keeps the capture node in the render graph without monitoring the mic.
    capture.connect(silent);
    silent.connect(context.destination);
    capture.port.onmessage = onCaptureMessage;
  } catch (error) {
    close();
    throw error;
  }

  const ctx = context;
  const port = capture.port;

  return {
    get generation() {
      return generation;
    },
    setMuted(value) {
      if (closed || value === muted) return;
      muted = value;
      muteGen += 1;
      port.postMessage({ type: "mute", muted, gen: muteGen });
    },
    enqueue(chunk) {
      if (closed || blocked.has(chunk.responseId)) return;
      const admittedEpoch = epoch;
      // Admit before decode, even an empty chunk, so a flush from inside the
      // codec or a later flush retires this response.
      seen.add(chunk.responseId);
      const samples = codec.decode(chunk.bytes);
      if (closed || blocked.has(chunk.responseId) || epoch !== admittedEpoch)
        return;
      const itemId = chunk.itemId ?? knownItem.get(chunk.responseId);
      if (itemId !== undefined && !knownItem.has(chunk.responseId)) {
        // First id of this response: the unidentified prefix adopts it.
        for (const e of entries) {
          if (e.responseId === chunk.responseId && e.itemId === undefined)
            e.itemId = itemId;
        }
        const old = bankKey({
          responseId: chunk.responseId,
          itemId: undefined,
        });
        const carried = banks.get(old);
        if (carried !== undefined) {
          banks.delete(old);
          const key = bankKey({ responseId: chunk.responseId, itemId });
          banks.set(key, (banks.get(key) ?? 0) + carried);
        }
        if (
          current?.responseId === chunk.responseId &&
          current.itemId === undefined
        ) {
          current = { responseId: current.responseId, itemId };
          announced = false;
        }
      }
      if (itemId !== undefined) knownItem.set(chunk.responseId, itemId);
      if (samples.length === 0) return;
      const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const start =
        nextStart > ctx.currentTime
          ? nextStart
          : ctx.currentTime + LEAD_SECONDS;
      const end = start + samples.length / SAMPLE_RATE;
      source.start(start);
      nextStart = end;
      entries.push({
        responseId: chunk.responseId,
        itemId,
        source,
        start,
        end,
      });
      ticker ??= deps.clock.setInterval(tick, TICK_MS);
    },
    discardResponse: (responseId) => void blocked.add(responseId),
    playedMs: () => (closed ? 0 : snapshotAt(ctx.currentTime).playedMs),
    flush(nextGeneration) {
      if (closed) {
        return {
          generation,
          responseId: undefined,
          itemId: undefined,
          playedMs: 0,
        };
      }
      const snapshot = snapshotAt(ctx.currentTime);
      const retired = snapshot.generation;
      epoch += 1;
      for (const id of seen) blocked.add(id);
      seen.clear();
      stopPlayback();
      current = undefined;
      banks.clear();
      knownItem.clear();
      announced = false;
      generation = nextGeneration ?? retired + 1;
      options.onPlayback({ type: "playbackDrained", generation: retired });
      return snapshot;
    },
    close,
  };
}
