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
import type { VoiceDecision, VoiceTurn } from "../app/api/voice/triage/request";
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
    decisions?: readonly VoiceDecision[],
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
  // Recorded Jev labels by turnId, sent with the next triage request.
  readonly decided: Map<string, VoiceDecision["label"]>;
  readonly forced: Set<string>;
  // Responses cut by an emergency. Their late audio is never played.
  readonly cancelled: Set<string>;
  // Every response id seen so far. The forced response is one never seen
  // before the forceMessage that produced it.
  readonly seen: Set<string>;
  // Guidance on the session: tied to the patient item whose response it covers.
  guide: { readonly itemId: string } | undefined;
  // Patient item -> its answering response. done: that response has ended.
  readonly answers: Map<string, { responseId: string | undefined; done: boolean }>;
  readonly answerOf: Map<string, string>;
  // The patient item still waiting for its response to start.
  awaiting: string | undefined;
  // The forced emergency message in flight: uninterruptible until it drains.
  forcing:
    | {
        responseId: string | undefined;
        // Unseen responses created since the force. The wire carries no
        // force-message correlation, so none is trusted as the forced one
        // (an automatic VAD response looks the same) until its audio arrives.
        readonly candidates: Set<string>;
        // Its audio reached the adapter, under `generation` (the adapter's own).
        started: boolean;
        generation: number | undefined;
        // Its response.done arrived.
        done: boolean;
        // Its audio drained under `generation` (reset if more audio follows).
        drained: boolean;
        // Bounds the wait for forced audio to bind; cleared on release.
        timer: unknown;
      }
    | undefined;
  // Later emergencies wait here, in order, for that playback to drain.
  readonly queued: (readonly string[])[];
};

const maxPrevious = 12;
const maxText = 2_000;
// How long a force may go without forced audio before later emergencies proceed.
const forceBindMs = 5_000;

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
    // A forced emergency is uninterruptible: it plays to its own drain.
    if (c.forcing) return;
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
    if (!c.guide) return;
    c.guide = undefined;
    quiet(() => c.socket?.updateInstructions(c.base));
  };

  // Every decision made so far loses the right to guide the session.
  const expire = (c: Call): void => {
    for (const answer of c.answers.values()) answer.done = true;
  };

  // Register a patient item as the one awaiting its response (idempotent).
  const bind = (c: Call, itemId: string): void => {
    if (c.answers.has(itemId)) return;
    // A patient item that never got a response is superseded by this one.
    if (c.awaiting !== undefined) {
      const old = c.answers.get(c.awaiting);
      if (old) old.done = true;
      if (c.guide?.itemId === c.awaiting) restore(c);
    }
    c.answers.set(itemId, { responseId: undefined, done: false });
    c.awaiting = itemId;
  };

  const emergency = (c: Call, audio: BrowserAudio, itemId: string, calls: EmergencyCalls): void => {
    if (c.forced.has(itemId)) return;
    c.forced.add(itemId);
    const sentences = forcedSentences(calls);
    // The buttons and sentences go out first: later audio failures cannot lose them.
    quiet(() => deps.onThreadEvent?.({ type: "emergency", itemId, calls, sentences }));
    restore(c);
    if (!live(c)) return;
    if (c.forcing) {
      // The previous forced message is uninterruptible: wait for it to drain.
      c.queued.push(sentences);
      return;
    }
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
    send(c, sentences);
  };

  const send = (c: Call, sentences: readonly string[]): void => {
    if (!live(c)) return;
    const f: NonNullable<Call["forcing"]> = {
      responseId: undefined,
      candidates: new Set(),
      started: false,
      generation: undefined,
      done: false,
      drained: false,
      timer: undefined,
    };
    c.forcing = f;
    f.timer = deps.setTimeout(() => {
      // Forced audio never arrived: a failed or silent force must not stall the queue.
      if (c.forcing === f && f.responseId === undefined) release(c);
    }, forceBindMs);
    try {
      c.socket?.forceMessage(sentences);
    } catch {
      // The force never left: nothing will speak, so free the slot.
      if (c.forcing === f) release(c);
    }
  };

  // Release only when the forced message ended on the server and its own audio
  // drained (or it ended with no audio at all).
  const settle = (c: Call): void => {
    const f = c.forcing;
    if (f?.done && (!f.started || f.drained)) release(c);
  };

  const release = (c: Call): void => {
    if (c.forcing?.timer !== undefined) deps.clearTimeout(c.forcing.timer);
    c.forcing = undefined;
    const next = c.queued.shift();
    if (next) send(c, next);
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
    // Triage is async: if the response for this item already ended (or the
    // patient moved on), the guidance would land on the next turn. Drop it.
    const answer = c.answers.get(itemId);
    if (!answer || answer.done) return;
    c.guide = { itemId };
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
    const decisions: VoiceDecision[] = previous.flatMap((t) => {
      const label = c.decided.get(t.turnId);
      return label === undefined ? [] : [{ turnId: t.turnId, label }];
    });
    c.turns.push(current);
    if (!port || !live(c)) return;
    void (async () => {
      let decision: TriageDecision | null = null;
      try {
        decision = await port(current, previous, c.abort.signal, decisions);
      } catch {
        // Fail closed.
      }
      if (decision && live(c)) {
        c.decided.set(itemId, decision.label);
        decide(c, audio, itemId, decision);
      }
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
        // A forced emergency is uninterruptible: the reducer's barge-in
        // transition would drop its playback, so it never sees this event.
        if (!(c.forcing && event.type === "input.speech_started")) {
          dispatch({ type: "server", event });
        }
        // Guidance covers one response: it ends with that response or the next turn.
        if (event.type === "input.speech_started") {
          // The patient spoke again: no earlier decision may guide anything now.
          expire(c);
          restore(c);
        }
        if (
          (event.type === "input.speech_started" ||
            event.type === "input.speech_stopped" ||
            event.type === "input.transcription_updated" ||
            event.type === "input.transcription_completed") &&
          event.itemId
        ) {
          // Bind the item before its transcript is final, so a response that
          // ends first still belongs to it.
          bind(c, event.itemId);
        }
        if (event.type === "response.cancelled") {
          const item = c.answerOf.get(event.responseId);
          const answer = item === undefined ? undefined : c.answers.get(item);
          if (answer) answer.done = true;
          if (item !== undefined && c.guide?.itemId === item) restore(c);
        }
        if (event.type === "response.done") {
          // Only the guided item's own response ends its guidance.
          const item = c.answerOf.get(event.responseId);
          if (item !== undefined) {
            const answer = c.answers.get(item);
            if (answer) answer.done = true;
            if (c.guide?.itemId === item) restore(c);
          }
        }
        const forcing = c.forcing;
        // A server error with no forced response in sight: the force failed.
        if (
          forcing &&
          event.type === "error" &&
          forcing.responseId === undefined &&
          forcing.candidates.size === 0
        ) {
          release(c);
        }
        if (forcing) {
          if (
            event.type === "response.created" &&
            !c.cancelled.has(event.responseId) &&
            !c.seen.has(event.responseId)
          ) {
            forcing.candidates.add(event.responseId);
          }
          if (event.type === "response.done") forcing.candidates.delete(event.responseId);
          if (event.type === "response.done" && event.responseId === forcing.responseId) {
            forcing.done = true;
            settle(c);
          }
        }
        if (event.type === "response.created") c.seen.add(event.responseId);
        if (
          event.type === "response.created" &&
          c.awaiting !== undefined &&
          c.forcing?.responseId !== event.responseId &&
          !c.answerOf.has(event.responseId)
        ) {
          const answer = c.answers.get(c.awaiting);
          if (answer) answer.responseId = event.responseId;
          c.answerOf.set(event.responseId, c.awaiting);
          c.awaiting = undefined;
        }
        if (event.type === "input.transcription_completed" && event.itemId) {
          bind(c, event.itemId);
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
          expire(c);
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
        const forcing = c.forcing;
        if (
          forcing &&
          bytes.length > 0 &&
          forcing.responseId === undefined &&
          forcing.candidates.has(id)
        ) {
          // The first candidate to speak is the forced message.
          forcing.responseId = id;
        }
        if (forcing && bytes.length > 0 && id === forcing.responseId) {
          // The adapter plays this under its own generation, not state's.
          forcing.started = true;
          forcing.generation = audio.generation;
          forcing.drained = false;
        }
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
      decided: new Map(),
      forced: new Set(),
      cancelled: new Set(),
      seen: new Set(),
      guide: undefined,
      answers: new Map(),
      answerOf: new Map(),
      awaiting: undefined,
      forcing: undefined,
      queued: [],
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
            onPlayback: (notice) => {
              if (!live(c)) return;
              dispatch(notice);
              const forcing = c.forcing;
              if (!forcing) return;
              if (
                notice.type === "playbackStarted" &&
                forcing.responseId !== undefined &&
                notice.responseId === forcing.responseId
              ) {
                forcing.started = true;
                forcing.generation = notice.generation;
              }
              if (
                notice.type === "playbackDrained" &&
                forcing.started &&
                notice.generation === forcing.generation
              ) {
                forcing.drained = true;
                settle(c);
              }
            },
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
