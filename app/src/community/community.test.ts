import { expect, it } from "vitest";
import { demoChallenges, demoSleepNights } from "./demo";
import { detectSleepDrop, hoursLabel } from "./sleep-signal";
import {
  addFriend,
  challengeById,
  createChallenge,
  nextMonday,
  findPeople,
  friendsOf,
  removeFriend,
  challengeDay,
  challengeStatus,
  initialCommunityState,
  shortDate,
  startLabel,
  joinChallenge,
  leaveChallenge,
  membershipFor,
  multiplierLabel,
  rewardFor,
} from "./store";

const steady = Array.from({ length: 14 }, (_, index) => ({ date: `d${index}`, minutes: 420 + (index % 3) * 5 }));

it("flags the demo sleep drop against the person's own baseline", () => {
  const signal = detectSleepDrop(demoSleepNights);
  expect(signal).not.toBeNull();
  expect(signal?.days).toBe(10);
  expect(signal?.lowNights).toBeGreaterThanOrEqual(7);
  expect(signal?.baselineMinutes).toBeGreaterThan(signal?.recentMinutes ?? 0);
});

it("stays quiet on steady sleep, short series, or a single bad night", () => {
  expect(detectSleepDrop(steady)).toBeNull();
  expect(detectSleepDrop(steady.slice(0, 8))).toBeNull();
  const oneBadNight = steady.map((night, index) => (index === 12 ? { ...night, minutes: 240 } : night));
  expect(detectSleepDrop(oneBadNight)).toBeNull();
});

it("formats durations in hours", () => {
  expect(hoursLabel(420)).toBe("7 h");
  expect(hoursLabel(330)).toBe("5 h 30");
});

it("multiplies the reward when you team up", () => {
  const challenge = demoChallenges[0];
  if (challenge === undefined) throw new Error("missing demo challenge");
  expect(rewardFor(challenge, [])).toBe(challenge.berries);
  expect(rewardFor(challenge, ["Léa"])).toBe(150);
  expect(multiplierLabel()).toBe("×1,5");
});

it("joins and leaves a challenge without duplicates", () => {
  const once = joinChallenge(initialCommunityState, "sleep-7x7", ["Léa"]);
  const twice = joinChallenge(once, "sleep-7x7", []);
  expect(twice.joined).toHaveLength(1);
  expect(membershipFor(twice, "sleep-7x7")?.teammates).toEqual([]);
  expect(joinChallenge(once, "unknown", []).joined).toHaveLength(1);
  expect(leaveChallenge(twice, "sleep-7x7").joined).toHaveLength(0);
});

it("sorts challenges into upcoming, ongoing and done from the demo calendar", () => {
  const byId = (id: string) => {
    const found = demoChallenges.find((item) => item.id === id);
    if (found === undefined) throw new Error(`missing ${id}`);
    return found;
  };
  expect(challengeStatus(byId("sleep-7x7"))).toBe("upcoming");
  expect(startLabel(byId("sleep-7x7"))).toBe("Commence lundi 30 nov.");
  expect(challengeStatus(byId("steps-10k"))).toBe("ongoing");
  expect(challengeDay(byId("steps-10k"))).toBe(8);
  expect(challengeStatus(byId("screens-off"), "2026-12-01")).toBe("done");
  expect(startLabel(byId("sleep-7x7"), "2026-11-29")).toBe("Commence demain");
  expect(shortDate("2026-11-09")).toBe("9 novembre");
});

it("adds and removes friends and only suggests people you can add", () => {
  expect(friendsOf(initialCommunityState).map((person) => person.name)).toEqual(["Léa", "Inès", "Marc"]);
  expect(findPeople(initialCommunityState, "").map((person) => person.name)).toEqual(["Sami", "Chloé", "Yanis"]);
  expect(findPeople(initialCommunityState, "chloe").map((person) => person.name)).toEqual(["Chloé"]);
  expect(findPeople(initialCommunityState, "vincennes").map((person) => person.name)).toEqual(["Chloé"]);
  const added = addFriend(initialCommunityState, "sami");
  expect(added.friends).toEqual(["lea", "ines", "marc", "sami"]);
  expect(addFriend(added, "sami")).toBe(added);
  expect(addFriend(added, "nobody")).toBe(added);
  expect(removeFriend(added, "lea").friends).toEqual(["ines", "marc", "sami"]);
});

it("creates a private challenge without Berries and joins it with the invited friends", () => {
  expect(nextMonday("2026-11-27")).toBe("2026-11-30");
  expect(nextMonday("2026-11-30")).toBe("2026-12-07");
  const input = { title: "Marche du midi", goal: "20 min après déjeuner", days: 7, startsOn: "2026-11-30", friendIds: ["lea", "sami"] };
  const result = createChallenge(initialCommunityState, input);
  if (result === null) throw new Error("expected a challenge");
  expect(result.challenge).toMatchObject({ id: "custom-1", custom: true, berries: 0 });
  expect(challengeById("custom-1", result.state)?.title).toBe("Marche du midi");
  expect(challengeById("custom-1")).toBeUndefined();
  // Sami is not a friend, so only Léa is invited.
  expect(membershipFor(result.state, "custom-1")?.teammates).toEqual(["Léa"]);
  expect(rewardFor(result.challenge, ["Léa"])).toBe(0);
  expect(createChallenge(initialCommunityState, { ...input, title: " a " })).toBeNull();
  expect(createChallenge(initialCommunityState, { ...input, days: 9 })).toBeNull();
});
