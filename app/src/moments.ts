import type { AvatarMood, AvatarState } from "open-bot-avatar";

interface Moment {
  readonly id: string;
  readonly label: string;
  readonly state: AvatarState;
  readonly mood: AvatarMood;
}

export const moments = [
  { id: "idle", label: "Idle", state: "idle", mood: "neutral" },
  {
    id: "listening",
    label: "Patient speaking",
    state: "waiting",
    mood: "neutral",
  },
  { id: "thinking", label: "Triage", state: "thinking", mood: "neutral" },
  {
    id: "calling",
    label: "Calling the practice",
    state: "working",
    mood: "neutral",
  },
  { id: "happy", label: "Slot confirmed", state: "done", mood: "happy" },
  { id: "serious", label: "Emergency", state: "blocked", mood: "neutral" },
] as const satisfies readonly Moment[];

export type MomentId = (typeof moments)[number]["id"];
