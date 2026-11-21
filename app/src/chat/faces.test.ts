import { expect, it } from "vitest";
import { mascotCue } from "./exchange.js";
import { faceFor } from "./faces.js";

it("picks Steve's face from avatar state and mood", () => {
  expect(faceFor({ state: "idle", mood: "neutral" })).toBe(
    "/mascot/state-listening.webp",
  );
  expect(faceFor({ state: "waiting", mood: "neutral" })).toBe(
    "/mascot/state-listening.webp",
  );
  expect(faceFor({ state: "thinking", mood: "neutral" })).toBe(
    "/mascot/state-thinking.webp",
  );
  expect(faceFor({ state: "working", mood: "neutral" })).toBe(
    "/mascot/state-calling.webp",
  );
  expect(faceFor({ state: "done", mood: "neutral" })).toBe(
    "/mascot/state-done.webp",
  );
  expect(faceFor({ state: "done", mood: "happy" })).toBe(
    "/mascot/state-done.webp",
  );
  expect(faceFor({ state: "idle", mood: "happy" })).toBe(
    "/mascot/state-done.webp",
  );
  expect(faceFor({ state: "blocked", mood: "neutral" })).toBe(
    "/mascot/state-urgent.webp",
  );
});

it("follows the chat exchange into a face", () => {
  expect(faceFor(mascotCue({ exchange: "idle", composing: false }))).toBe(
    "/mascot/state-listening.webp",
  );
  expect(faceFor(mascotCue({ exchange: "idle", composing: true }))).toBe(
    "/mascot/state-listening.webp",
  );
  expect(faceFor(mascotCue({ exchange: "awaiting", composing: true }))).toBe(
    "/mascot/state-thinking.webp",
  );
  expect(faceFor(mascotCue({ exchange: "rendering", composing: false }))).toBe(
    "/mascot/state-calling.webp",
  );
  expect(faceFor(mascotCue({ exchange: "settled", composing: false }))).toBe(
    "/mascot/state-done.webp",
  );
  expect(faceFor(mascotCue({ exchange: "settled", composing: true }))).toBe(
    "/mascot/state-listening.webp",
  );
  expect(faceFor(mascotCue({ exchange: "failed", composing: false }))).toBe(
    "/mascot/state-urgent.webp",
  );
  expect(faceFor(mascotCue({ exchange: "failed", composing: true }))).toBe(
    "/mascot/state-listening.webp",
  );
});
