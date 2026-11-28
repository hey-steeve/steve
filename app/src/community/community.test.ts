import { expect, it } from "vitest";
import { demoChallenges, demoSleepNights } from "./demo";
import { detectSleepDrop, hoursLabel } from "./sleep-signal";
import {
  initialCommunityState,
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
