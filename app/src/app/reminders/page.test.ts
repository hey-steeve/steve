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
  expect(container.querySelector("h1")?.textContent).toBe("Mes rappels");
  expect(container.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe(
    "/mascot/bubbles.webp",
  );
  expect(container.textContent).toContain("Planifié");
  expect(container.textContent).toContain("Rendez-vous avec Camille Lunéval");
  expect(container.textContent).toContain("Mercredi 2 décembre · 10 h");
  expect(container.textContent).toContain("Rappel le 1er décembre à 18 h");
  expect(container.textContent).toContain("Par SMS");
});

it("updates the reminder channel and time via @steve/reminders", async () => {
  const container = await mount();
  await act(async () => {
    buttonWithText(container, "Modifier le rappel").click();
  });
  await act(async () => {
    buttonWithText(container, "Par appel").click();
    buttonWithText(container, "Matin · 8 h").click();
  });
  await act(async () => {
    buttonWithText(container, "Enregistrer").click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Rappel mis à jour.");
  expect(container.textContent).toContain("Par appel");
  expect(container.textContent).toContain("Rappel le 2 décembre à 8 h");
});
