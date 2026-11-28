// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import AgendaPage from "./page.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AgendaPage));
  });
  return container;
}

it("renders the confirmed appointment for December 2 and week calendar", async () => {
  const container = await mount();
  expect(container.querySelector("h1")?.textContent).toBe("My calendar");
  expect(container.querySelector(".agenda-month-label")?.textContent?.toLowerCase()).toBe(
    "december 2026",
  );
  expect(container.textContent).toContain("Next appointment");
  expect(container.textContent).toContain("Confirmed");
  expect(container.textContent).toContain("Camille Lunéval");
  expect(container.textContent).toContain("Wednesday 2 December · 10:00");
  expect(container.textContent).toContain("1 rue des Nuages Mauves");
  expect(container.textContent).toContain("75011 Paris");
});

it("exports a valid VCALENDAR .ics payload via @steve/agenda", async () => {
  const container = await mount();
  const exportButton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Add to calendar"),
  );
  if (!(exportButton instanceof HTMLButtonElement)) {
    throw new Error("Missing export button");
  }
  await act(async () => {
    exportButton.click();
  });
  const preview = container.querySelector(".agenda-ics-preview")?.textContent ?? "";
  expect(preview).toContain("BEGIN:VCALENDAR");
  expect(preview).toContain("BEGIN:VEVENT");
  expect(preview).toContain("Camille Lunéval");
  expect(preview).toContain("END:VCALENDAR");
});

it("shows the empty day state when another day is selected and jumps back to Dec 2", async () => {
  const container = await mount();
  const dayThree = [...container.querySelectorAll(".agenda-day-btn")].find(
    (button) => button.textContent?.trim() === "3",
  );
  if (!(dayThree instanceof HTMLButtonElement)) {
    throw new Error("Missing day 3 button");
  }
  await act(async () => {
    dayThree.click();
  });
  expect(container.textContent).toContain("No confirmed appointment that day");
  const backToDec2 = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "See 2 December",
  );
  if (!(backToDec2 instanceof HTMLButtonElement)) {
    throw new Error("Missing return to Dec 2 button");
  }
  await act(async () => {
    backToDec2.click();
  });
  expect(container.textContent).toContain("Camille Lunéval");
});
