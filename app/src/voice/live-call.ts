import {
  initialCallState,
  reduceCall,
  type CallActivity,
  type CallEvent,
  type CallState,
  type EndReason,
  type VoiceTuning,
} from "@steve/voice";
import type { BrowserAudio, BrowserAudioOptions } from "./browser-audio";
import type { RealtimeSocket, RealtimeSocketOptions } from "./realtime-socket";

export type { EndReason };

// The only hard spend control: one call lasts at most 10 minutes.
export const callCapMs = 600_000;

// Minimal thread shape. The chat page keeps its own richer message type.
export type ThreadMessage = {
  readonly role: "user" | "assistant";
  readonly content: string;
};

// Keyed transcript update. A later update for the same itemId replaces the text.
export type ThreadEvent = {
  readonly type: "transcript";
  readonly itemId: string;
  readonly text: string;
  readonly final: boolean;
};

export type CallSnapshot = {
  readonly phase: CallState["phase"];
  readonly muted: boolean;
  readonly activity: CallActivity | undefined;
  readonly endReason: EndReason | undefined;
};

export type CallDeps = {
  // Mints a client secret. The signal aborts when the call ends.
  readonly fetchToken: (signal: AbortSignal) => Promise<{ readonly value: string }>;
  readonly connect: (options: RealtimeSocketOptions) => RealtimeSocket;
  readonly startAudio: (options: BrowserAudioOptions) => Promise<BrowserAudio>;
  readonly instructions: (history: readonly ThreadMessage[]) => string;
  readonly keyterms: readonly string[];
  readonly tuning: VoiceTuning;
  readonly now: () => number;
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
  readonly onThreadEvent?: (event: ThreadEvent) => void;
};

export interface LiveCallController {
  start(history: readonly ThreadMessage[]): Promise<void>;
  setMuted(muted: boolean): void;
  end(reason: EndReason): void;
  // The hook calls these from its own visibility and pagehide listeners.
  handlePageHidden(): void;
  handlePageExit(): void;
  getSnapshot(): CallSnapshot;
  subscribe(listener: () => void): () => void;
}

// One object per call. Late events from an ended call see `ended` and stop.
type Call = {
  ended: boolean;
  readonly deadline: number;
  readonly abort: AbortController;
  timer: unknown;
  audio: BrowserAudio | undefined;
  socket: RealtimeSocket | undefined;
  // Item announced for the generating response. Binary audio has no ids, so
  // this is what ties its queued bytes to an item at barge-in.
  announced: { readonly responseId: string; readonly itemId: string } | undefined;
};

const quiet = (fn: () => void): void => {
  try {
    fn();
  } catch {
    // Closing an already closed resource is fine.
  }
};

const toSnapshot = (s: CallState): CallSnapshot => ({
  phase: s.phase,
  muted: s.phase === "active" && s.muted,
  activity: s.phase === "active" ? s.activity : undefined,
  endReason: s.phase === "ended" ? s.reason : undefined,
});

export function createLiveCall(deps: CallDeps): LiveCallController {
  let state: CallState = initialCallState;
  let snapshot = toSnapshot(state);
  let call: Call | undefined;
  const listeners = new Set<() => void>();

  const dispatch = (event: CallEvent): void => {
    const next = reduceCall(state, event);
    if (next === state) return;
    state = next;
    const s = toSnapshot(next);
    if (
      s.phase === snapshot.phase &&
      s.muted === snapshot.muted &&
      s.activity === snapshot.activity &&
      s.endReason === snapshot.endReason
    ) {
      return;
    }
    snapshot = s;
    for (const listener of [...listeners]) listener();
  };

  const end = (reason: EndReason): void => {
    const c = call;
    if (!c || c.ended) return;
    c.ended = true;
    if (c.timer !== undefined) deps.clearTimeout(c.timer);
    c.abort.abort();
    const { audio, socket } = c;
    if (audio) quiet(() => audio.close());
    if (socket) quiet(() => socket.close());
    dispatch({ type: "end", reason });
  };

  // True while the call may still do I/O. Past the deadline it ends with "cap".
  const live = (c: Call): boolean => {
    if (c.ended) return false;
    if (deps.now() < c.deadline) return true;
    end("cap");
    return false;
  };

  const onCancel = (c: Call, audio: BrowserAudio, generating: boolean): void => {
    if (state.phase !== "active" || !state.cancel) return;
    const { generation } = state;
    // One clock read pairs the item id with its offset (BC-68).
    const snap = audio.flush(generation);
    if (!live(c)) return;
    if (generating) c.socket?.cancelResponse();
    // Untagged binary audio takes the item announced for its own response.
    const itemId =
      snap.itemId ??
      (snap.responseId !== undefined && snap.responseId === c.announced?.responseId
        ? c.announced.itemId
        : undefined);
    if (itemId !== undefined && live(c)) {
      c.socket?.truncate(itemId, snap.playedMs);
    }
  };

  const open = (c: Call, token: string, instructions: string): void => {
    const audio = c.audio;
    if (!audio || !live(c)) return;
    const onClose = (): void => {
      if (!live(c)) return;
      end(state.phase === "active" ? "connection-lost" : "failed");
    };
    const socket = deps.connect({
      token,
      instructions,
      keyterms: deps.keyterms,
      tuning: deps.tuning,
      // The adapter asks before it sends session.update. Past the deadline
      // this ends the call with "cap" and the adapter sends nothing.
      canHandshake: () => live(c),
      onOpen: () => live(c) && dispatch({ type: "connected" }),
      onError: onClose,
      onClose,
      onEvent: (event) => {
        if (!live(c)) return;
        if (
          (event.type === "input.transcription_updated" ||
            event.type === "input.transcription_completed") &&
          event.itemId
        ) {
          deps.onThreadEvent?.({
            type: "transcript",
            itemId: event.itemId,
            text: event.text,
            final: event.type === "input.transcription_completed",
          });
        }
        const before = state;
        dispatch({ type: "server", event });
        if (
          event.type === "response.output_item_added" &&
          state.phase === "active" &&
          state.generating &&
          state.responseId === event.responseId &&
          state.generatingItemId === event.itemId
        ) {
          c.announced = { responseId: event.responseId, itemId: event.itemId };
        }
        const fresh =
          state.phase === "active" &&
          state.cancel !== undefined &&
          !(before.phase === "active" && before.cancel === state.cancel);
        if (fresh) {
          onCancel(c, audio, before.phase === "active" && before.generating);
        }
      },
      onAudio: ({ bytes, responseId, itemId }) => {
        if (!live(c)) return;
        if (state.phase !== "active" || !state.generating) return;
        // Binary audio carries no ids. It belongs to the generating response.
        // A chunk that names a response must match the current one (BC-45/63).
        const id = responseId ?? state.responseId;
        if (id === undefined || id !== state.responseId) return;
        if (
          responseId !== undefined &&
          itemId !== undefined &&
          state.generatingItemId !== undefined &&
          itemId !== state.generatingItemId
        ) {
          return;
        }
        audio.enqueue({ bytes, responseId: id, itemId });
      },
    });
    c.socket = socket;
    if (!live(c)) quiet(() => socket.close());
    else if (socket.mock) dispatch({ type: "connected" });
  };

  const start = async (history: readonly ThreadMessage[]): Promise<void> => {
    if (state.phase === "connecting" || state.phase === "active") return;
    state = initialCallState;
    const abort = new AbortController();
    const c: Call = {
      ended: false,
      deadline: deps.now() + callCapMs,
      abort,
      timer: undefined,
      audio: undefined,
      socket: undefined,
      announced: undefined,
    };
    call = c;
    dispatch({ type: "start" });

    const wake = (): void => {
      if (c.ended) return;
      const left = c.deadline - deps.now();
      if (left <= 0) end("cap");
      else c.timer = deps.setTimeout(wake, left);
    };
    c.timer = deps.setTimeout(wake, callCapMs);

    try {
      const [secret] = await Promise.all([
        deps.fetchToken(abort.signal),
        deps
          .startAudio({
            codec: deps.tuning.codec,
            signal: abort.signal,
            onMicChunk: (bytes) => {
              if (!live(c)) return;
              if (state.phase === "active") c.socket?.sendAudio(bytes);
            },
            onPlayback: (notice) => live(c) && dispatch(notice),
          })
          .then((audio) => {
            // Late permission or a passed deadline: nothing owns this audio.
            if (!live(c)) quiet(() => audio.close());
            else c.audio = audio;
          }),
      ]);
      open(c, secret.value, deps.instructions(history));
    } catch {
      // Only the call that began this attempt may be failed by it.
      // A passed deadline ends the call with "cap" instead.
      if (call === c && live(c)) end("failed");
    }
  };

  return {
    start,
    setMuted: (muted) => {
      if (state.phase !== "active") return;
      if (call && !live(call)) return;
      call?.audio?.setMuted(muted);
      dispatch({ type: "setMuted", muted });
    },
    end,
    handlePageHidden: () => end("page-exit"),
    handlePageExit: () => end("page-exit"),
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
