import type { AvatarMood, AvatarState } from "open-bot-avatar";

interface Moment {
  readonly id: string;
  readonly label: string;
  readonly state: AvatarState;
  readonly mood: AvatarMood;
}

export const moments = [
  { id: "idle", label: "Repos", state: "idle", mood: "neutral" },
  {
    id: "listening",
    label: "Le patient parle",
    state: "waiting",
    mood: "neutral",
  },
  { id: "thinking", label: "Triage", state: "thinking", mood: "neutral" },
  {
    id: "calling",
    label: "Appel au cabinet",
    state: "working",
    mood: "neutral",
  },
  { id: "happy", label: "Créneau confirmé", state: "done", mood: "happy" },
  { id: "serious", label: "Urgence", state: "blocked", mood: "neutral" },
] as const satisfies readonly Moment[];

export type MomentId = (typeof moments)[number]["id"];
