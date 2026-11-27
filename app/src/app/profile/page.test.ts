// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import ProfilePage from "./page.js";

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
    root.render(createElement(ProfilePage));
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

it("renders the patient identity, mascot, and profile menu sections", async () => {
  const container = await mount();
  expect(container.querySelector("h1")?.textContent).toBe("Mon profil");
  expect(container.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe(
    "/mascot/profile-card.webp",
  );
  expect(container.querySelector(".profile-avatar")?.textContent).toBe("PP");
  expect(container.querySelector(".profile-name")?.textContent).toBe("Peter Parker");
  expect(container.textContent).not.toContain("Données de démonstration");
  expect(container.textContent).toContain("Préférences");
  expect(container.textContent).toContain("Historique déclaré");
  expect(container.textContent).toContain("Historique des appels");
});

it("displays preferences and declared history from @steve/profile", async () => {
  const container = await mount();
  await act(async () => {
    buttonWithText(container, "Préférences").click();
  });
  expect(container.textContent).toContain("Créneaux après 18 h en semaine");

  await act(async () => {
    buttonWithText(container, "Historique déclaré").click();
  });
  expect(container.textContent).toContain("Céleste Vandroux");
  expect(container.textContent).toContain("sans interprétation médicale");
});

it("adds a preference via the in-memory profile store and rejects duplicates", async () => {
  const container = await mount();
  await act(async () => {
    buttonWithText(container, "Modifier mon profil").click();
  });
  const input = container.querySelector("#profile-new-preference");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing preference input");
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      "Secteur 1 uniquement",
    );
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await act(async () => {
    buttonWithText(container, "Enregistrer la préférence").click();
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Préférence ajoutée.");

  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      "Secteur 1 uniquement",
    );
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await act(async () => {
    buttonWithText(container, "Enregistrer la préférence").click();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Cette préférence est déjà enregistrée.",
  );
});
