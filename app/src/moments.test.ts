import { expect, it } from "vitest";
import { moments } from "./moments.js";

it("maps Steve's moments onto avatar state and mood", () => {
  expect(
    moments.map((moment) => [moment.id, moment.state, moment.mood]),
  ).toEqual([
    ["idle", "idle", "neutral"],
    ["listening", "waiting", "neutral"],
    ["thinking", "thinking", "neutral"],
    ["calling", "working", "neutral"],
    ["happy", "done", "happy"],
    ["serious", "blocked", "neutral"],
  ]);
});
