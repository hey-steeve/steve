import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Frame = { gen: number; samples: Float32Array };
type Port = { onmessage: ((e: { data: unknown }) => void) | null; postMessage(m: Frame): void };
type Processor = { port: Port; process(i: Float32Array[][]): boolean };

const source = readFileSync(new URL("../../public/voice/capture.worklet.js", import.meta.url), "utf8");

// Loads the real worklet file with stubbed AudioWorkletProcessor/registerProcessor.
function load() {
  const frames: Frame[] = [];
  let Ctor: (new () => Processor) | undefined;
  class Base {
    port: Port = { onmessage: null, postMessage: (m) => void frames.push(m) };
  }
  runInNewContext(source, {
    AudioWorkletProcessor: Base,
    Float32Array,
    registerProcessor: (_: string, c: new () => Processor) => (Ctor = c),
  });
  if (!Ctor) throw new Error("worklet did not register");
  const p = new Ctor();
  return {
    frames,
    feed: (value: number, n: number) => p.process([[new Float32Array(n).fill(value)]]),
    mute: (muted: boolean, gen: number) =>
      p.port.onmessage?.({ data: { type: "mute", muted, gen } }),
  };
}

describe("BC-49 capture worklet", () => {
  it("BC-49 partial block filled before mute is discarded, first frame after unmute is clean", () => {
    const w = load();
    w.feed(0.5, 512); // partial, pre-mute
    w.mute(true, 1);
    w.feed(0.9, 512); // muted
    w.mute(false, 2);
    w.feed(0.1, 960);
    expect(w.frames.length === 1).toBe(true);
    const f = w.frames[0];
    expect(f !== undefined && f.gen === 2).toBe(true);
    expect(f !== undefined && f.samples.every((s) => Math.fround(0.1) === s)).toBe(true);
  });

  it("BC-49 muted input produces no frames, even past a full block", () => {
    const w = load();
    w.mute(true, 1);
    w.feed(0.9, 2000);
    expect(w.frames.length === 0).toBe(true);
  });

  it("BC-49 unmute then a fresh full block is sent", () => {
    const w = load();
    w.mute(true, 1);
    w.mute(false, 2);
    w.feed(0.3, 960);
    const first = w.frames[0];
    expect(w.frames.length === 1 && first !== undefined && first.samples.length === 960).toBe(true);
  });
});
