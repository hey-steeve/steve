"use client";

import { useSyncExternalStore } from "react";
import {
  communityToday,
  demoChallenges,
  demoInitialFriends,
  demoPeople,
  demoStartingBerries,
  type Challenge,
  type Person,
} from "./demo";

export const teamMultiplier = 1.5;

export type Membership = {
  readonly challengeId: string;
  readonly teammates: readonly string[];
};

export type CommunityState = {
  readonly berries: number;
  readonly joined: readonly Membership[];
  readonly invited: number;
  readonly friends: readonly string[];
  readonly custom: readonly Challenge[];
};

export const initialCommunityState: CommunityState = {
  berries: demoStartingBerries,
  joined: [],
  invited: 0,
  friends: demoInitialFriends,
  custom: [],
};

export function rewardFor(challenge: Challenge, teammates: readonly string[]): number {
  if (challenge.custom === true) return 0;
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
  if (challengeById(challengeId, state) === undefined) {
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

export function addFriend(state: CommunityState, personId: string): CommunityState {
  if (state.friends.includes(personId) || !demoPeople.some((person) => person.id === personId)) return state;
  return { ...state, friends: [...state.friends, personId] };
}

export function removeFriend(state: CommunityState, personId: string): CommunityState {
  return { ...state, friends: state.friends.filter((id) => id !== personId) };
}

export function friendsOf(state: CommunityState): readonly Person[] {
  return state.friends.flatMap((id) => demoPeople.filter((person) => person.id === id));
}

// People you can add, matched on name or city, accents ignored.
export function findPeople(state: CommunityState, query: string): readonly Person[] {
  const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const needle = fold(query.trim());
  return demoPeople.filter(
    (person) =>
      !state.friends.includes(person.id) &&
      (needle === "" || fold(person.name).includes(needle) || fold(person.city).includes(needle)),
  );
}

export function membershipFor(state: CommunityState, challengeId: string): Membership | undefined {
  return state.joined.find((item) => item.challengeId === challengeId);
}

export type ChallengeStatus = "ongoing" | "upcoming" | "done";

const dayMs = 86_400_000;

function dayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T12:00:00Z`) / dayMs);
}

// Day 1 is the start day. Before it the challenge is upcoming, after the
// last day it is done.
export function challengeDay(challenge: Challenge, today: string = communityToday): number {
  return dayNumber(today) - dayNumber(challenge.startsOn) + 1;
}

export function challengeStatus(challenge: Challenge, today: string = communityToday): ChallengeStatus {
  const day = challengeDay(challenge, today);
  if (day < 1) return "upcoming";
  return day > challenge.days ? "done" : "ongoing";
}

export function startLabel(challenge: Challenge, today: string = communityToday): string {
  const until = 1 - challengeDay(challenge, today);
  if (until <= 0) return "Commencé";
  if (until === 1) return "Commence demain";
  const date = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${challenge.startsOn}T12:00:00Z`),
  );
  return `Commence ${date}`;
}

export function shortDate(isoDate: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}

export function challengeById(id: string, state?: CommunityState): Challenge | undefined {
  return demoChallenges.find((item) => item.id === id) ?? state?.custom.find((item) => item.id === id);
}

export const customDurations = [3, 7, 14, 30] as const;

export type NewChallenge = {
  readonly title: string;
  readonly goal: string;
  readonly days: number;
  readonly startsOn: string;
  readonly friendIds: readonly string[];
};

const me = { name: "Toi", initials: "MOI", tone: "indigo" } as const;

export function nextMonday(today: string = communityToday): string {
  const date = new Date(`${today}T12:00:00Z`);
  const ahead = ((8 - date.getUTCDay()) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + ahead);
  return date.toISOString().slice(0, 10);
}

// A challenge you create stays private: no Berries (nothing to farm), not
// in the catalogue, and only the friends you invite join it with you.
export function createChallenge(
  state: CommunityState,
  input: NewChallenge,
): { readonly state: CommunityState; readonly challenge: Challenge } | null {
  const title = input.title.trim();
  const goal = input.goal.trim();
  if (title.length < 3 || goal.length < 3 || !customDurations.some((days) => days === input.days)) return null;
  const invited = friendsOf(state).filter((person) => input.friendIds.includes(person.id));
  const challenge: Challenge = {
    id: `custom-${state.custom.length + 1}`,
    title: title.slice(0, 40),
    goal: goal.slice(0, 60),
    partner: me,
    days: input.days,
    berries: 0,
    teams: 0,
    startsOn: input.startsOn,
    custom: true,
  };
  const withChallenge = { ...state, custom: [...state.custom, challenge] };
  return {
    challenge,
    state: joinChallenge(withChallenge, challenge.id, invited.map((person) => person.name)),
  };
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
    // Older saves predate friends: keep their progress, add the defaults.
    if (isState(parsed)) current = { ...initialCommunityState, ...parsed };
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
