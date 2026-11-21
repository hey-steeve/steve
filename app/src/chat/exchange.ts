import type { AvatarMood, AvatarState } from "open-bot-avatar";
import { moments, type MomentId } from "../moments";

export type ExchangeKind =
  | "idle"
  | "awaiting"
  | "rendering"
  | "settled"
  | "failed";

export interface MascotCue {
  readonly state: AvatarState;
  readonly mood: AvatarMood;
}

const phaseMoment = {
  idle: "idle",
  awaiting: "thinking",
  rendering: "calling",
  settled: "happy",
  failed: "serious",
} as const satisfies Record<ExchangeKind, MomentId>;

export function mascotCue(input: {
  readonly exchange: ExchangeKind;
  readonly composing: boolean;
}): MascotCue {
  if (
    input.composing &&
    input.exchange !== "awaiting" &&
    input.exchange !== "rendering"
  ) {
    return cueFor("listening");
  }
  return cueFor(phaseMoment[input.exchange]);
}

function cueFor(id: MomentId): MascotCue {
  switch (id) {
    case "idle":
    case "listening":
    case "thinking":
    case "calling":
    case "happy":
    case "serious": {
      const moment = moments.find((item) => item.id === id);
      if (moment === undefined) {
        throw new Error(`Missing moment ${id}`);
      }
      return { state: moment.state, mood: moment.mood };
    }
    default: {
      return missingMoment(id);
    }
  }
}

function missingMoment(id: never): never {
  throw new Error(`Missing moment ${id}`);
}
