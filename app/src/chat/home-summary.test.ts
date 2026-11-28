import { expect, it } from "vitest";
import {
  appointmentDay,
  appointmentTime,
  countdownLabel,
  daysUntil,
  homeDemoNow,
  homeNextAppointment,
} from "./home-summary.js";

it("counts calendar days in Paris time", () => {
  expect(daysUntil(homeDemoNow, homeNextAppointment.startsAt)).toBe(5);
  expect(daysUntil(new Date("2026-12-01T23:30:00Z"), "2026-12-02T08:00:00+01:00")).toBe(0);
  expect(daysUntil(new Date("2026-12-01T22:30:00Z"), "2026-12-02T08:00:00+01:00")).toBe(1);
});

it("words the countdown in French", () => {
  expect(countdownLabel(0)).toBe("Today");
  expect(countdownLabel(-2)).toBe("Today");
  expect(countdownLabel(1)).toBe("Tomorrow");
  expect(countdownLabel(5)).toBe("In 5 days");
});

it("formats the appointment day and time in Paris time", () => {
  expect(appointmentDay(homeNextAppointment.startsAt)).toBe("Wed 2 Dec");
  expect(appointmentTime(homeNextAppointment.startsAt)).toBe("10:00");
});
