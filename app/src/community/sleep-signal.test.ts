import { expect, it } from "vitest";
import { demoSleepNights } from "./demo";
import { detectSleepDrop, hoursLabel } from "./sleep-signal";

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
