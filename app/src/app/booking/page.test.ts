// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import BookingClient from "./booking-client.js";

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

async function mount(node: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return container;
}

function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return found;
}

it("renders the confirmed booking card with practitioner details and agenda link", async () => {
  const container = await mount(createElement(BookingClient, { callDelayMs: 0 }));
  expect(container.querySelector("h1")?.textContent).toBe("Prise de rendez-vous");
  expect(container.textContent).toContain("Appel au cabinet");
  expect(container.textContent).toContain("Créneau confirmé");
  expect(container.textContent).toContain("Rendez-vous confirmé");
  expect(container.textContent).toContain("Camille Lunéval");
  expect(container.textContent).toContain("Mercredi 2 décembre · 10 h");
  expect(container.textContent).toContain("1 rue des Nuages Mauves");
  expect(container.querySelector('a[href="/agenda"]')?.textContent).toContain(
    "Voir dans l’agenda",
  );
});

it("renders the in-progress calling state with the phone mascot", async () => {
  const container = await mount(
    createElement(BookingClient, { initialPhase: "calling", callDelayMs: 0 }),
  );
  expect(container.querySelector("h1")?.textContent).toBe("Appel au cabinet");
  expect(container.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe(
    "/mascot/state-calling.webp",
  );
  expect(container.textContent).toContain("Appel en cours");
  expect(container.textContent).toContain("En attente de confirmation");
});

it("runs the practice call and confirms the first practitioner's slot", async () => {
  const container = await mount(createElement(BookingClient, { callDelayMs: 0 }));
  await act(async () => {
    buttonByText(container, "Lancer l’appel au cabinet").click();
  });
  expect(container.textContent).toContain("Rendez-vous confirmé");
  expect(container.textContent).toContain("Mercredi 2 décembre · 10 h");
});
