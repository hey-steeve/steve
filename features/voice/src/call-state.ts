import type { ServerEvent } from "./events.ts";

export type EndReason =
  | "hang-up"
  | "cap"
  | "page-exit"
  | "connection-lost"
  | "failed";

export type CallActivity = "listening" | "speaking";

export type PlaybackCancel = {
  readonly responseId: string | undefined;
  readonly itemId: string | undefined;
  readonly playedMs: number;
};

export type Playback = {
  readonly responseId: string | undefined;
  readonly itemId: string | undefined;
  readonly playedMs: number;
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
  | { readonly type: "playback"; readonly playedMs: number }
  // The hook's local audio queue is empty.
  | { readonly type: "playbackDrained" }
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
      if (state.activity !== "speaking") return { ...state, cancel: undefined };
      return {
        ...state,
        activity: "listening",
        generating: false,
        responseId: undefined,
        playback: undefined,
        cancel: {
          responseId: state.playback?.responseId ?? state.responseId,
          itemId: state.playback?.itemId,
          playedMs: state.playback?.playedMs ?? 0,
        },
      };
    }
    case "response.created":
      return withActivity({
        ...state,
        generating: true,
        responseId: event.responseId,
        cancel: undefined,
      });
    case "response.audio_delta": {
      // Late deltas of a finished or cut response must not restart playback.
      if (!state.generating) return state;
      if (!matches(state.responseId, event.responseId)) return state;
      const itemId = event.itemId ?? state.playback?.itemId;
      const same = state.playback?.itemId === itemId;
      return withActivity({
        ...state,
        playback: {
          responseId: state.responseId ?? event.responseId,
          itemId,
          playedMs: same ? (state.playback?.playedMs ?? 0) : 0,
        },
      });
    }
    case "response.done":
      if (!matches(state.responseId, event.responseId)) return state;
      return withActivity({
        ...state,
        generating: false,
        responseId: undefined,
        cancel: undefined,
      });
    case "response.cancelled": {
      const genMatch = matches(state.responseId, event.responseId);
      const playMatch = matches(state.playback?.responseId, event.responseId);
      return withActivity({
        ...state,
        generating: genMatch ? false : state.generating,
        responseId: genMatch ? undefined : state.responseId,
        playback: playMatch ? undefined : state.playback,
        cancel: undefined,
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
      if (event.type === "playback") {
        if (!state.playback) return state;
        const playedMs = Math.max(0, event.playedMs);
        return { ...state, playback: { ...state.playback, playedMs } };
      }
      if (event.type === "playbackDrained") {
        return withActivity({ ...state, playback: undefined });
      }
      return event.type === "server" ? reduceActive(state, event.event) : state;
  }
}
