import {
  initialCallState,
  reduceCall,
  type CallActivity,
  type CallEvent,
  type CallState,
  type EndReason,
  type VoiceTuning,
} from "@steve/voice";
import type { Turn } from "@steve/shared";
import {
  consultGuidance,
  needInfoGuidance,
  type EmergencyCalls,
  type TriageDecision,
} from "@steve/triage";
import type { VoiceTurn } from "../app/api/voice/triage/request";
import type { BrowserAudio, BrowserAudioOptions } from "./browser-audio";
import { forcedSentences, type ForcedSentences } from "./voice-safety";
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
export type ThreadEvent =
  | {
      readonly type: "transcript";
      readonly itemId: string;
      readonly text: string;
      readonly final: boolean;
    }
  // Jev said emergency: the exact sentences Steve is forced to say, in order.
  | {
      readonly type: "emergency";
      readonly itemId: string;
      readonly calls: EmergencyCalls;
      readonly sentences: ForcedSentences;
    }
  // A non-emergency decision that offers calls. Nothing is forced.
  | {
      readonly type: "offer";
      readonly itemId: string;
      readonly calls: NonNullable<Exclude<TriageDecision, { label: "emergency" }>["calls"]>;
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
  // Omitted: no triage. Null: fail closed, the call goes on unforced.
  readonly triage?: (
    current: VoiceTurn,
    previous: readonly Turn[],
    signal: AbortSignal,
  ) => Promise<TriageDecision | null>;
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
  readonly sessionId: string;
  base: string;
  // Patient turns in order: start() history, then finalized in-call turns.
  readonly turns: Turn[];
  readonly asked: Set<string>;
  readonly forced: Set<string>;
  // Responses cut by an emergency. Their late audio is never played.
  readonly cancelled: Set<string>;
  guided: boolean;
};

const maxPrevious = 12;
const maxText = 2_000;

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
    // Only the flush snapshot names the audible item and its offset. The
    // adapter binds announced ids to queued audio (see the announce below).
    if (snap.itemId !== undefined && live(c)) {
      c.socket?.truncate(snap.itemId, snap.playedMs);
    }
  };

  const restore = (c: Call): void => {
    if (!c.guided) return;
    c.guided = false;
    quiet(() => c.socket?.updateInstructions(c.base));
  };

  const emergency = (c: Call, audio: BrowserAudio, itemId: string, calls: EmergencyCalls): void => {
    if (c.forced.has(itemId)) return;
    c.forced.add(itemId);
    const sentences = forcedSentences(calls);
    // The buttons and sentences go out first: later audio failures cannot lose them.
    quiet(() => deps.onThreadEvent?.({ type: "emergency", itemId, calls, sentences }));
    restore(c);
    if (!live(c)) return;
    if (state.phase === "active") {
      const inFlight = state.generating ? state.responseId : undefined;
      const ids = [inFlight, state.playback?.responseId].filter((id) => id !== undefined);
      quiet(() => audio.flush());
      if (!live(c)) return;
      if (inFlight !== undefined) quiet(() => c.socket?.cancelResponse());
      for (const id of ids) {
        c.cancelled.add(id);
        quiet(() => audio.discardResponse(id));
      }
    }
    if (live(c)) quiet(() => c.socket?.forceMessage(sentences));
  };

  const decide = (c: Call, audio: BrowserAudio, itemId: string, d: TriageDecision): void => {
    if (d.label === "emergency") return emergency(c, audio, itemId, d.calls);
    const offered = d.calls;
    if (offered) quiet(() => deps.onThreadEvent?.({ type: "offer", itemId, calls: offered }));
    const text =
      d.label === "consult"
        ? consultGuidance.text
        : d.label === "need-info"
          ? (d.guidance?.text ?? needInfoGuidance.text)
          : undefined;
    if (text === undefined || !live(c)) return;
    c.guided = true;
    quiet(() => c.socket?.updateInstructions(`${c.base}\n\n${text}`));
  };

  const triage = (c: Call, audio: BrowserAudio, itemId: string, text: string): void => {
    const port = deps.triage;
    if (c.asked.has(itemId) || text.trim() === "") return;
    c.asked.add(itemId);
    const current: VoiceTurn = {
      sessionId: c.sessionId,
      turnId: itemId,
      channel: "voice",
      text: text.slice(0, maxText),
    };
    const previous = c.turns.slice(-maxPrevious);
    c.turns.push(current);
    if (!port || !live(c)) return;
    void (async () => {
      let decision: TriageDecision | null = null;
      try {
        decision = await port(current, previous, c.abort.signal);
      } catch {
        // Fail closed.
      }
      if (decision && live(c)) decide(c, audio, itemId, decision);
    })();
  };

  const open = (c: Call, token: string, instructions: string): void => {
    const audio = c.audio;
    if (!audio || !live(c)) return;
    c.base = instructions;
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
        // Guidance covers one response: it ends with that response or the next turn.
        if (event.type === "response.done" || event.type === "input.speech_started") restore(c);
        if (event.type === "input.transcription_completed" && event.itemId) {
          triage(c, audio, event.itemId, event.text);
        }
        if (
          event.type === "response.output_item_added" &&
          !c.cancelled.has(event.responseId) &&
          state.phase === "active" &&
          state.generating &&
          state.responseId === event.responseId &&
          state.generatingItemId === event.itemId
        ) {
          // Binary audio has no ids. A zero-length chunk hands the announced
          // id to the adapter, which attaches it to queued untagged audio.
          audio.enqueue({
            bytes: new Uint8Array(0),
            responseId: event.responseId,
            itemId: event.itemId,
          });
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
        // Only binary audio carries no ids at all; it belongs to the generating
        // response. An item id without a response id is stale JSON: drop it.
        // A chunk that names a response must match the current one (BC-45/63).
        if (responseId === undefined && itemId !== undefined) return;
        const id = responseId ?? state.responseId;
        if (id === undefined || id !== state.responseId) return;
        if (c.cancelled.has(id)) return;
        if (
          responseId !== undefined &&
          itemId !== undefined &&
          state.generatingItemId !== undefined &&
          itemId !== state.generatingItemId
        ) {
          return;
        }
        audio.enqueue({ bytes, responseId: id, itemId });
        // Binary audio reaches the reducer only through the ticker's first
        // playbackStarted. Record the queued playback now, so response.done
        // before that tick keeps the call speaking and barge-in can flush.
        if (
          bytes.length > 0 &&
          live(c) &&
          state.phase === "active" &&
          !state.playback
        ) {
          dispatch({
            type: "playbackStarted",
            responseId: id,
            itemId,
            generation: state.generation,
          });
        }
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
    const sessionId = globalThis.crypto.randomUUID();
    const c: Call = {
      ended: false,
      deadline: deps.now() + callCapMs,
      abort,
      timer: undefined,
      audio: undefined,
      socket: undefined,
      sessionId,
      base: "",
      turns: history
        .filter((m) => m.role === "user" && m.content.trim() !== "")
        .map((m, i) => ({
          sessionId,
          turnId: `history-${i}`,
          channel: "text" as const,
          text: m.content.slice(0, maxText),
        })),
      asked: new Set(),
      forced: new Set(),
      cancelled: new Set(),
      guided: false,
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
      if (call && !live(call)) return;
      if (state.phase !== "active") return;
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
