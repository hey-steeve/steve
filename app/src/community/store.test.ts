import { expect, it } from "vitest";
import { demoChallenges } from "./demo";
import {
  initialCommunityState,
  joinChallenge,
  leaveChallenge,
  membershipFor,
  multiplierLabel,
  rewardFor,
} from "./store";

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
