// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { VoiceTuning } from "@steve/voice";
import type { BrowserAudio } from "./browser-audio";
import type { CallDeps, ThreadEvent } from "./live-call";
import type { RealtimeSocket, RealtimeSocketOptions } from "./realtime-socket";
import { useLiveCall, type LiveCall } from "./use-live-call";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

const tuning: VoiceTuning = { reasoningEffort: "none", codec: "pcm16-24k", transport: "json" };

function mount() {
  const sockets: RealtimeSocketOptions[] = [];
  const counts = { socketClose: 0, audioClose: 0, sent: 0 };
  let micChunk: ((bytes: Uint8Array) => void) | undefined;
  const events: ThreadEvent[] = [];
  const audio: BrowserAudio = {
    generation: 0,
    setMuted() {},
    enqueue() {},
    discardResponse() {},
    playedMs: () => 0,
    flush: () => ({ generation: 0, responseId: undefined, itemId: undefined, playedMs: 0 }),
    close() {
      counts.audioClose += 1;
    },
  };
  const socket: RealtimeSocket = {
    mock: false,
    sendAudio() {
      counts.sent += 1;
    },
    cancelResponse() {},
    truncate() {},
    close() {
      counts.socketClose += 1;
    },
  };
  const deps: CallDeps = {
    fetchToken: async () => ({ value: "t" }),
    connect: (o) => {
      sockets.push(o);
      return socket;
    },
    startAudio: async (o) => {
      micChunk = o.onMicChunk;
      return audio;
    },
    instructions: () => "base",
    keyterms: [],
    tuning,
    now: () => 0,
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  let call: LiveCall | undefined;
  const Probe = () => {
    call = useLiveCall((e) => events.push(e), deps);
    return null;
  };
  const root = createRoot(document.createElement("div"));
  roots.push(root);
  act(() => root.render(createElement(Probe)));
  const current = (): LiveCall => {
    if (!call) throw new Error("not mounted");
    return call;
  };
  const open = async () => {
    await act(async () => current().start([]));
    act(() => sockets[0]?.onOpen?.());
  };
  const unmount = () => {
    roots.splice(roots.indexOf(root), 1);
    act(() => root.unmount());
  };
  const mic = (bytes: Uint8Array) => micChunk?.(bytes);
  return { current, sockets, events, open, counts, unmount, mic };
}

it("starts, mutes and hangs up through the hook", async () => {
  const h = mount();
  await h.open();
  expect(h.current().phase).toBe("active");
  act(() => h.current().setMuted(true));
  expect(h.current().muted).toBe(true);
  act(() => h.current().end());
  expect(h.current().phase).toBe("ended");
  expect(h.current().endReason).toBe("hang-up");
});

it("ends with page-exit when the page hides", async () => {
  const h = mount();
  await h.open();
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  expect(h.current().endReason).toBe("page-exit");
});

it("ends with page-exit when the document becomes hidden", async () => {
  const h = mount();
  await h.open();
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  Reflect.deleteProperty(document, "visibilityState");
  expect(h.current().endReason).toBe("page-exit");
});

it("forwards transcripts and drops stale ones after end", async () => {
  const h = mount();
  await h.open();
  const options = h.sockets[0];
  act(() =>
    options?.onEvent({ type: "input.transcription_completed", itemId: "t1", text: "ok" }),
  );
  expect(h.events.map((e) => [e.itemId, e.final])).toEqual([["t1", true]]);
  act(() => h.current().end());
  act(() =>
    options?.onEvent({ type: "input.transcription_updated", itemId: "t2", text: "late" }),
  );
  expect(h.events.length).toBe(1);
});

it("ends the call on unmount so the mic and socket close", async () => {
  const h = mount();
  await h.open();
  h.mic(new Uint8Array([1]));
  expect(h.counts.sent).toBe(1);
  h.unmount();
  expect(h.counts.socketClose).toBeGreaterThan(0);
  expect(h.counts.audioClose).toBeGreaterThan(0);
  h.mic(new Uint8Array([2]));
  expect(h.counts.sent).toBe(1);
});
