import type { AvatarState } from "open-bot-avatar";
import type { MascotCue } from "./exchange";

export const steveFace = {
  listening: "/mascot/state-listening.webp",
  thinking: "/mascot/state-thinking.webp",
  calling: "/mascot/state-calling.webp",
  done: "/mascot/state-done.webp",
  urgent: "/mascot/state-urgent.webp",
} as const;

export type SteveFace = (typeof steveFace)[keyof typeof steveFace];

export const steveFaces: readonly SteveFace[] = [
  steveFace.listening,
  steveFace.thinking,
  steveFace.calling,
  steveFace.done,
  steveFace.urgent,
];

const faceByState = {
  idle: steveFace.listening,
  waiting: steveFace.listening,
  thinking: steveFace.thinking,
  working: steveFace.calling,
  done: steveFace.done,
  blocked: steveFace.urgent,
} as const satisfies Record<AvatarState, SteveFace>;

export const heroSrc = "/mascot/bubbles-hd.webp";

export const pageMascots = {
  profile: "/mascot/profile-card.webp",
  documents: "/mascot/documents.webp",
  inbox: "/mascot/mailbox.webp",
  challenges: "/mascot/running.webp",
} as const;

export const headerAvatarSrc = "/mascot/pfp-lavender-profile.webp";

export const replyAvatarSrc = headerAvatarSrc;

export const askAvatarSrc = "/mascot/pfp-phone.webp";

export function faceFor(cue: MascotCue): SteveFace {
  if (cue.mood === "happy") {
    return steveFace.done;
  }
  return faceByState[cue.state];
}
