export type ExchangeKind =
  | "idle"
  | "awaiting"
  | "rendering"
  | "settled"
  | "failed";

const cueById = {
  idle: { state: "idle", mood: "neutral" },
  listening: { state: "waiting", mood: "neutral" },
  thinking: { state: "thinking", mood: "neutral" },
  calling: { state: "working", mood: "neutral" },
  happy: { state: "done", mood: "happy" },
  serious: { state: "blocked", mood: "neutral" },
} as const;

export interface MascotCue {
  readonly state: (typeof cueById)[keyof typeof cueById]["state"];
  readonly mood: (typeof cueById)[keyof typeof cueById]["mood"];
}

const phaseMoment = {
  idle: "idle",
  awaiting: "thinking",
  rendering: "calling",
  settled: "happy",
  failed: "serious",
} as const satisfies Record<ExchangeKind, keyof typeof cueById>;

export function mascotCue(input: {
  readonly exchange: ExchangeKind;
  readonly composing: boolean;
}): MascotCue {
  if (
    input.composing &&
    input.exchange !== "awaiting" &&
    input.exchange !== "rendering"
  ) {
    return cueById.listening;
  }
  return cueById[phaseMoment[input.exchange]];
}
