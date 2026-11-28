// Synthetic demo data. No real person or health record.
// The sleep series is shaped like a wearable export (one total per night).

import type { SleepNight } from "./sleep-signal";

const sleepMinutes = [425, 438, 416, 431, 352, 331, 348, 322, 337, 318, 329, 326, 312, 334];

export const demoSleepNights: readonly SleepNight[] = sleepMinutes.map((minutes, index) => ({
  date: new Date(Date.UTC(2026, 10, 14 + index)).toISOString().slice(0, 10),
  minutes,
}));
