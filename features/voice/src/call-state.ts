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

export type CallState =
  | { readonly phase: "idle" }
  | { readonly phase: "connecting" }
  | {
      readonly phase: "active";
      readonly muted: boolean;
      readonly activity: CallActivity;
      readonly responseId: string | undefined;
      readonly itemId: string | undefined;
      readonly playedMs: number;
      // Set on barge-in. The hook flushes local audio and cancels the response.
      readonly cancel: PlaybackCancel | undefined;
    }
  | { readonly phase: "ended"; readonly reason: EndReason };

export type CallEvent =
  | { readonly type: "start" }
  | { readonly type: "connected" }
  | { readonly type: "setMuted"; readonly muted: boolean }
  | { readonly type: "playback"; readonly playedMs: number }
  | { readonly type: "end"; readonly reason: EndReason }
  | { readonly type: "server"; readonly event: ServerEvent };

export const initialCallState: CallState = { phase: "idle" };

type Active = Extract<CallState, { phase: "active" }>;

const activeState: Active = {
  phase: "active",
  muted: false,
  activity: "listening",
  responseId: undefined,
  itemId: undefined,
  playedMs: 0,
  cancel: undefined,
};

function reduceActive(state: Active, event: ServerEvent): CallState {
  switch (event.type) {
    case "input.speech_started": {
      if (state.activity !== "speaking") return { ...state, cancel: undefined };
      return {
        ...state,
        activity: "listening",
        responseId: undefined,
        itemId: undefined,
        playedMs: 0,
        cancel: {
          responseId: state.responseId,
          itemId: state.itemId,
          playedMs: state.playedMs,
        },
      };
    }
    case "response.created":
      return {
        ...state,
        activity: "speaking",
        responseId: event.responseId,
        itemId: undefined,
        playedMs: 0,
        cancel: undefined,
      };
    case "response.audio_delta":
      // Late deltas of a response cut by barge-in must not restart playback.
      if (state.activity !== "speaking") return state;
      return {
        ...state,
        itemId: event.itemId ?? state.itemId,
        responseId: state.responseId ?? event.responseId,
      };
    case "response.done":
    case "response.cancelled":
      return { ...state, activity: "listening", responseId: undefined, itemId: undefined, playedMs: 0, cancel: undefined };
    case "error":
      return { phase: "ended", reason: "failed" };
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
      return event.type === "connected" ? activeState : state;
    case "active":
      if (event.type === "setMuted") return { ...state, muted: event.muted };
      if (event.type === "playback") {
        return { ...state, playedMs: Math.max(0, event.playedMs) };
      }
      return event.type === "server" ? reduceActive(state, event.event) : state;
  }
}
