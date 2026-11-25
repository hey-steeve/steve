import type { ServerEvent } from "./events.ts";

export type EndReason =
  | "hang-up"
  | "cap"
  | "page-exit"
  | "connection-lost"
  | "failed";

export type CallActivity = "listening" | "speaking";

export type PlaybackCancel = {
  // Truncation target: the audible response and item, with the played offset.
  readonly responseId: string | undefined;
  readonly itemId: string | undefined;
  readonly playedMs: number;
  // Response still generating when it differs from the audible one. The hook
  // sends response.cancel for it.
  readonly generatingResponseId?: string | undefined;
};

export type Playback = {
  readonly responseId: string | undefined;
  readonly itemId: string | undefined;
  readonly playedMs: number;
  // Playback generation the hook tagged this audio with.
  readonly generation: number;
};

export type CallState =
  | { readonly phase: "idle" }
  | { readonly phase: "connecting" }
  | {
      readonly phase: "active";
      readonly muted: boolean;
      // Speaking while a response is generating or local audio is still queued.
      readonly activity: CallActivity;
      // Generation: the response the server is still producing.
      readonly generating: boolean;
      readonly responseId: string | undefined;
      // Latest item announced for the generating response. Binary audio has no ids.
      readonly generatingItemId: string | undefined;
      // Playback generation. Barge-in retires it. The hook tags playback events with it.
      readonly generation: number;
      // Generation whose flush acknowledgment clears `cancel`.
      readonly cancelGeneration: number | undefined;
      // Playback: audio queued locally. It outlives response.done.
      readonly playback: Playback | undefined;
      // Set on barge-in. The hook flushes local audio and cancels the response.
      readonly cancel: PlaybackCancel | undefined;
      // Last server error on an active call. The hook decides what to do.
      readonly lastError: string | undefined;
    }
  | { readonly phase: "ended"; readonly reason: EndReason };

export type CallEvent =
  | { readonly type: "start" }
  | { readonly type: "connected" }
  | { readonly type: "setMuted"; readonly muted: boolean }
  // The audible item changed. The hook reports it for JSON and binary audio.
  | {
      readonly type: "playbackStarted";
      readonly responseId: string;
      readonly itemId: string | undefined;
      readonly generation: number;
    }
  | {
      readonly type: "playback";
      readonly playedMs: number;
      readonly generation: number;
    }
  // The hook's local audio queue for this generation is empty or flushed.
  | { readonly type: "playbackDrained"; readonly generation: number }
  | { readonly type: "end"; readonly reason: EndReason }
  | { readonly type: "server"; readonly event: ServerEvent };

export const initialCallState: CallState = { phase: "idle" };

type Active = Extract<CallState, { phase: "active" }>;

const activeState: Active = {
  phase: "active",
  muted: false,
  activity: "listening",
  generating: false,
  responseId: undefined,
  generatingItemId: undefined,
  generation: 0,
  cancelGeneration: undefined,
  playback: undefined,
  cancel: undefined,
  lastError: undefined,
};

const withActivity = (state: Active): Active => ({
  ...state,
  activity:
    state.generating || state.playback !== undefined
      ? "speaking"
      : "listening",
});

// An event without an id applies to whatever is current.
const matches = (current: string | undefined, id: string | undefined) =>
  id === undefined || current === undefined || current === id;

function reduceActive(state: Active, event: ServerEvent): CallState {
  switch (event.type) {
    case "input.speech_started": {
      if (state.activity !== "speaking") return state;
      // Pending truncation and generation cancel are tracked independently.
      // The first audible target stays until its flush is acknowledged.
      const audibleId = state.playback?.responseId ?? state.responseId;
      const truncation =
        state.cancel ??
        (state.playback
          ? {
              responseId: audibleId,
              itemId: state.playback.itemId,
              playedMs: state.playback.playedMs,
            }
          : { responseId: audibleId, itemId: state.generatingItemId, playedMs: 0 });
      const generatingResponseId =
        state.responseId !== truncation.responseId
          ? (state.responseId ?? state.cancel?.generatingResponseId)
          : undefined;
      return {
        ...state,
        activity: "listening",
        generating: false,
        responseId: undefined,
        generatingItemId: undefined,
        generation: state.generation + 1,
        cancelGeneration: state.cancel ? state.cancelGeneration : state.generation,
        playback: undefined,
        cancel: { ...truncation, generatingResponseId },
      };
    }
    case "response.created":
      return withActivity({
        ...state,
        generating: true,
        responseId: event.responseId,
        generatingItemId: undefined,
      });
    case "response.output_item_added":
      if (!state.generating || state.responseId !== event.responseId) return state;
      return {
        ...state,
        generatingItemId: event.itemId,
        playback:
          state.playback?.responseId === event.responseId &&
          state.playback.itemId === undefined
            ? { ...state.playback, itemId: event.itemId }
            : state.playback,
      };
    case "response.audio_delta": {
      // Late deltas of a finished or cut response must not restart playback.
      if (!state.generating) return state;
      if (!matches(state.responseId, event.responseId)) return state;
      // Another item may still be audible. playbackStarted switches to the new one.
      if (state.playback) return state;
      return withActivity({
        ...state,
        playback: {
          responseId: state.responseId ?? event.responseId,
          itemId: event.itemId ?? state.generatingItemId,
          playedMs: 0,
          generation: state.generation,
        },
      });
    }
    case "response.done":
      if (!matches(state.responseId, event.responseId)) return state;
      return withActivity({
        ...state,
        generating: false,
        responseId: undefined,
        generatingItemId: undefined,
      });
    case "response.cancelled": {
      // Ends server generation only. Local barge-in state clears on flush ack.
      if (!matches(state.responseId, event.responseId)) return state;
      return withActivity({
        ...state,
        generating: false,
        responseId: undefined,
        generatingItemId: undefined,
      });
    }
    case "error":
      return { ...state, lastError: event.message };
    default:
      return state;
  }
}

export function reduceCall(state: CallState, event: CallEvent): CallState {
  if (state.phase === "ended") return state;
  if (event.type === "end") return { phase: "ended", reason: event.reason };
  switch (state.phase) {
    case "idle":
      return event.type === "start" ? { phase: "connecting" } : state;
    case "connecting":
      if (event.type === "connected") return activeState;
      if (event.type === "server" && event.event.type === "error") {
        return { phase: "ended", reason: "failed" };
      }
      return state;
    case "active":
      if (event.type === "setMuted") return { ...state, muted: event.muted };
      if (event.type === "playbackStarted") {
        // Late starts from a retired generation or a cut response are ignored.
        if (event.generation !== state.generation) return state;
        const { cancel } = state;
        if (
          cancel?.responseId === event.responseId ||
          cancel?.generatingResponseId === event.responseId
        ) {
          return state;
        }
        const itemId =
          event.itemId ??
          (state.responseId === event.responseId ? state.generatingItemId : undefined);
        const same =
          state.playback?.responseId === event.responseId &&
          state.playback.itemId === itemId;
        return withActivity({
          ...state,
          playback: {
            responseId: event.responseId,
            itemId,
            playedMs: same ? (state.playback?.playedMs ?? 0) : 0,
            generation: event.generation,
          },
        });
      }
      if (event.type === "playback") {
        if (!state.playback || state.playback.generation !== event.generation) {
          return state;
        }
        const playedMs = Math.max(0, event.playedMs);
        return { ...state, playback: { ...state.playback, playedMs } };
      }
      if (event.type === "playbackDrained") {
        // A drain clears only its own generation's playback and pending cancel.
        const ownPlayback = state.playback?.generation === event.generation;
        const ownCancel = state.cancelGeneration === event.generation;
        return withActivity({
          ...state,
          playback: ownPlayback ? undefined : state.playback,
          cancel: ownCancel ? undefined : state.cancel,
          cancelGeneration: ownCancel ? undefined : state.cancelGeneration,
        });
      }
      return event.type === "server" ? reduceActive(state, event.event) : state;
  }
}
