// Synthetic community data for the demo. No real person or health record.
// The sleep series is shaped like a wearable export (one total per night).

import type { SleepNight } from "./sleep-signal";

export type Partner = { readonly name: string; readonly initials: string; readonly tone: "indigo" | "teal" | "orange" };

export type Challenge = {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly partner: Partner;
  readonly days: number;
  readonly berries: number;
  readonly teams: number;
  readonly startsOn: string;
  readonly friend?: string;
};

// The demo calendar is frozen on this day, like the home summary.
export const communityToday = "2026-11-27";

export type Friend = { readonly name: string; readonly initial: string; readonly tone: "indigo" | "teal" | "orange" };

const alan: Partner = { name: "Alan", initials: "AL", tone: "indigo" };
const move: Partner = { name: "Salle Move", initials: "MV", tone: "teal" };
const fresh: Partner = { name: "Fraîcheur & Co", initials: "FR", tone: "orange" };

export const demoFriend: Friend = { name: "Léa", initial: "L", tone: "teal" };

export const demoChallenges: readonly Challenge[] = [
  {
    id: "sleep-7x7",
    title: "Sommeil 7 × 7",
    goal: "7 nuits de plus de 7 h",
    partner: alan,
    days: 7,
    berries: 100,
    teams: 23,
    startsOn: "2026-11-30",
    friend: demoFriend.name,
  },
  {
    id: "steps-10k",
    title: "10 000 pas par jour",
    goal: "10 000 pas chaque jour",
    partner: move,
    days: 14,
    berries: 100,
    teams: 12,
    startsOn: "2026-11-20",
  },
  {
    id: "five-a-day",
    title: "5 fruits et légumes",
    goal: "5 portions par jour",
    partner: fresh,
    days: 7,
    berries: 60,
    teams: 8,
    startsOn: "2026-12-07",
  },
  {
    id: "screens-off",
    title: "Écrans off à 22 h",
    goal: "Pas d’écran après 22 h",
    partner: alan,
    days: 5,
    berries: 50,
    teams: 15,
    startsOn: "2026-11-25",
  },
];

export type PastChallenge = {
  readonly title: string;
  readonly team: string;
  readonly berries: number;
  readonly endedOn: string;
  readonly days: number;
};

export const demoHistory: readonly PastChallenge[] = [
  { title: "10 000 pas", team: "équipe de 4", berries: 150, endedOn: "2026-11-09", days: 14 },
  { title: "Écrans off à 22 h", team: "solo", berries: 50, endedOn: "2026-10-26", days: 5 },
  { title: "Hydratation 1,5 L", team: "avec Léa", berries: 90, endedOn: "2026-10-12", days: 7 },
];

export type FriendChallenge = { readonly challengeId: string; readonly teammates: readonly string[] };

export type Person = {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly challenges: readonly FriendChallenge[];
  readonly done: number;
};

// Synthetic people. The first three start as friends; the rest are people
// you can add.
export const demoPeople: readonly Person[] = [
  { id: "lea", name: "Léa", city: "Paris 11e", done: 6, challenges: [{ challengeId: "sleep-7x7", teammates: [] }, { challengeId: "five-a-day", teammates: ["Inès"] }] },
  { id: "ines", name: "Inès", city: "Paris 12e", done: 3, challenges: [{ challengeId: "steps-10k", teammates: ["Marc"] }] },
  { id: "marc", name: "Marc", city: "Montreuil", done: 9, challenges: [{ challengeId: "steps-10k", teammates: ["Inès"] }, { challengeId: "screens-off", teammates: [] }] },
  { id: "sami", name: "Sami", city: "Paris 20e", done: 2, challenges: [{ challengeId: "screens-off", teammates: [] }] },
  { id: "chloe", name: "Chloé", city: "Vincennes", done: 4, challenges: [{ challengeId: "five-a-day", teammates: [] }] },
  { id: "yanis", name: "Yanis", city: "Paris 10e", done: 1, challenges: [] },
];

export const demoInitialFriends: readonly string[] = ["lea", "ines", "marc"];

export const demoStartingBerries = 200;
export const demoStreakDays = 12;

const sleepMinutes = [425, 438, 416, 431, 352, 331, 348, 322, 337, 318, 329, 326, 312, 334];

export const demoSleepNights: readonly SleepNight[] = sleepMinutes.map((minutes, index) => ({
  date: new Date(Date.UTC(2026, 10, 14 + index)).toISOString().slice(0, 10),
  minutes,
}));

export const referral = {
  code: "STEVIE-7X7",
  berries: 50,
  invited: 2,
  joined: 1,
} as const;
