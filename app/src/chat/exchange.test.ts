import { expect, it } from "vitest";
import { mascotCue } from "./exchange.js";

it("maps the exchange onto avatar state and mood", () => {
  expect(mascotCue({ exchange: "idle", composing: false })).toEqual({
    state: "idle",
    mood: "neutral",
  });
  expect(mascotCue({ exchange: "idle", composing: true })).toEqual({
    state: "waiting",
    mood: "neutral",
  });
  expect(mascotCue({ exchange: "awaiting", composing: true })).toEqual({
    state: "thinking",
    mood: "neutral",
  });
  expect(mascotCue({ exchange: "rendering", composing: false })).toEqual({
    state: "working",
    mood: "neutral",
  });
  expect(mascotCue({ exchange: "settled", composing: false })).toEqual({
    state: "done",
    mood: "happy",
  });
  expect(mascotCue({ exchange: "settled", composing: true })).toEqual({
    state: "waiting",
    mood: "neutral",
  });
  expect(mascotCue({ exchange: "failed", composing: false })).toEqual({
    state: "blocked",
    mood: "neutral",
  });
  expect(mascotCue({ exchange: "failed", composing: true })).toEqual({
    state: "waiting",
    mood: "neutral",
  });
});
