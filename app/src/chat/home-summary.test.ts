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
  expect(countdownLabel(0)).toBe("Aujourd’hui");
  expect(countdownLabel(-2)).toBe("Aujourd’hui");
  expect(countdownLabel(1)).toBe("Demain");
  expect(countdownLabel(5)).toBe("Dans 5 jours");
});

it("formats the appointment day and time in Paris time", () => {
  expect(appointmentDay(homeNextAppointment.startsAt)).toBe("Mer. 2 déc.");
  expect(appointmentTime(homeNextAppointment.startsAt)).toBe("10:00");
});
