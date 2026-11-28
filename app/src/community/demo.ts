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
  readonly friend?: string;
};

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
  },
  {
    id: "five-a-day",
    title: "5 fruits et légumes",
    goal: "5 portions par jour",
    partner: fresh,
    days: 7,
    berries: 60,
    teams: 8,
  },
  {
    id: "screens-off",
    title: "Écrans off à 22 h",
    goal: "Pas d’écran après 22 h",
    partner: alan,
    days: 5,
    berries: 50,
    teams: 15,
  },
];

export const demoHistory = [
  { title: "10 000 pas", team: "équipe de 4", berries: 150 },
  { title: "Écrans off à 22 h", team: "solo", berries: 50 },
] as const;

export const demoStartingBerries = 200;
export const demoStreakDays = 12;

const sleepMinutes = [425, 438, 416, 431, 352, 331, 348, 322, 337, 318, 329, 326, 312, 334];

export const demoSleepNights: readonly SleepNight[] = sleepMinutes.map((minutes, index) => ({
  date: new Date(Date.UTC(2026, 10, 14 + index)).toISOString().slice(0, 10),
  minutes,
}));

export const referral = {
  code: "STEVE-7X7",
  berries: 50,
  invited: 2,
  joined: 1,
} as const;
