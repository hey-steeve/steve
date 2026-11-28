// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { resetCommunity } from "../../community/store";
import ChallengesPage from "./page.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Root[] = [];

beforeEach(() => {
  resetCommunity();
});

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
    root.render(createElement(ChallengesPage));
  });
  return container;
}

function button(container: ParentNode, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button: ${text}`);
  return found;
}

it("lists partner challenges and the team finder", async () => {
  const view = await mount();
  expect(view.querySelector("h1")?.textContent).toBe("Défis");
  expect(view.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe("/mascot/running.webp");
  expect(view.textContent).toContain("Sommeil 7 × 7");
  expect(view.textContent).toContain("Pas d’équipe ?");
  expect(view.querySelectorAll(".challenges-join")).toHaveLength(4);
});

it("joins a challenge with a friend through Steve and multiplies the reward", async () => {
  const view = await mount();
  const first = view.querySelector(".challenges-join");
  if (!(first instanceof HTMLButtonElement)) throw new Error("missing join button");
  await act(async () => {
    first.click();
  });
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  expect(sheet.textContent).toContain("Léa le fait aussi");
  await act(async () => {
    button(sheet, "Oui, avec Léa").click();
  });
  expect(sheet.textContent).toContain("Participation confirmée");
  expect(sheet.textContent).toContain("150 Berries à la clé");
  expect(sheet.textContent).toContain("on met le défi en pause");
  await act(async () => {
    button(sheet, "Voir mes défis").click();
  });
  expect(view.querySelector('[role="dialog"]')).toBeNull();
  expect(view.querySelector(".challenges-active")?.textContent).toContain("×1,5 en équipe");
  expect(view.querySelectorAll(".challenges-join")).toHaveLength(3);
});

it("lets Steve find a team when you have none", async () => {
  const view = await mount();
  await act(async () => {
    button(view, "Trouve-moi une équipe").click();
  });
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  await act(async () => {
    button(sheet, "Trouve-moi une équipe").click();
  });
  expect(sheet.textContent).toContain("J’ai trouvé Inès et Marc");
});
