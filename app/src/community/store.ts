"use client";

import { useSyncExternalStore } from "react";
import { demoChallenges, demoStartingBerries, type Challenge } from "./demo";

export const teamMultiplier = 1.5;

export type Membership = {
  readonly challengeId: string;
  readonly teammates: readonly string[];
};

export type CommunityState = {
  readonly berries: number;
  readonly joined: readonly Membership[];
  readonly invited: number;
};

export const initialCommunityState: CommunityState = {
  berries: demoStartingBerries,
  joined: [],
  invited: 0,
};

export function rewardFor(challenge: Challenge, teammates: readonly string[]): number {
  return teammates.length > 0 ? Math.round(challenge.berries * teamMultiplier) : challenge.berries;
}

export function multiplierLabel(): string {
  return `×${String(teamMultiplier).replace(".", ",")}`;
}

export function joinChallenge(
  state: CommunityState,
  challengeId: string,
  teammates: readonly string[],
): CommunityState {
  if (!demoChallenges.some((item) => item.id === challengeId)) {
    return state;
  }
  const others = state.joined.filter((item) => item.challengeId !== challengeId);
  return { ...state, joined: [...others, { challengeId, teammates }] };
}

export function leaveChallenge(state: CommunityState, challengeId: string): CommunityState {
  return { ...state, joined: state.joined.filter((item) => item.challengeId !== challengeId) };
}

export function recordInvite(state: CommunityState): CommunityState {
  return { ...state, invited: state.invited + 1 };
}

export function membershipFor(state: CommunityState, challengeId: string): Membership | undefined {
  return state.joined.find((item) => item.challengeId === challengeId);
}

export function challengeById(id: string): Challenge | undefined {
  return demoChallenges.find((item) => item.id === id);
}

const storageKey = "steve.community.v1";
const listeners = new Set<() => void>();
let current: CommunityState | null = null;

function isState(value: unknown): value is CommunityState {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "berries") === "number" &&
    typeof Reflect.get(value, "invited") === "number" &&
    Array.isArray(Reflect.get(value, "joined"))
  );
}

function read(): CommunityState {
  if (current !== null) return current;
  current = initialCommunityState;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (isState(parsed)) current = parsed;
  } catch {
    current = initialCommunityState;
  }
  return current;
}

export function updateCommunity(change: (state: CommunityState) => CommunityState): void {
  current = change(read());
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(current));
  } catch {
    // Storage can be blocked; the state still lives for this session.
  }
  for (const listener of listeners) listener();
}

export function resetCommunity(): void {
  updateCommunity(() => initialCommunityState);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCommunity(): CommunityState {
  return useSyncExternalStore(subscribe, read, () => initialCommunityState);
}
