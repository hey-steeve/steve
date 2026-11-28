// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import RemindersPage from "./page.js";

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
    root.render(createElement(RemindersPage));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return container;
}

function buttonWithText(container: ParentNode, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return found;
}

it("renders the scheduled appointment reminder with mascot and SMS channel", async () => {
  const container = await mount();
  expect(container.querySelector("h1")?.textContent).toBe("My reminders");
  expect(container.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe(
    "/mascot/bubbles-hd.webp",
  );
  expect(container.textContent).toContain("Scheduled");
  expect(container.textContent).toContain("Appointment with Camille Lunéval");
  expect(container.textContent).toContain("Wednesday 2 December · 10:00");
  expect(container.textContent).toContain("Reminder on 1 December at 6 pm");
  expect(container.textContent).toContain("By text");
});

it("updates the reminder channel and time via @steve/reminders", async () => {
  const container = await mount();
  await act(async () => {
    buttonWithText(container, "Edit the reminder").click();
  });
  await act(async () => {
    buttonWithText(container, "By call").click();
    buttonWithText(container, "Morning · 8 am").click();
  });
  await act(async () => {
    buttonWithText(container, "Save").click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Reminder updated.");
  expect(container.textContent).toContain("By call");
  expect(container.textContent).toContain("Reminder on 2 December at 8 am");
});
