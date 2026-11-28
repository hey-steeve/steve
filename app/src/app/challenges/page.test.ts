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

async function openSection(container: ParentNode, label: string) {
  const tab = [...container.querySelectorAll('[role="tab"]')].find((item) => item.textContent?.startsWith(label));
  if (!(tab instanceof HTMLButtonElement)) throw new Error(`Missing tab: ${label}`);
  await act(async () => tab.click());
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
  await openSection(view, "Découvrir");
  expect(view.textContent).toContain("Sommeil 7 × 7");
  expect(view.textContent).toContain("Pas d’équipe ?");
  expect(view.querySelectorAll(".challenges-join")).toHaveLength(4);
});

it("joins a challenge with a friend through Stevie and multiplies the reward", async () => {
  const view = await mount();
  await openSection(view, "Découvrir");
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
  // Sommeil 7 × 7 starts on Monday, so it lands under À venir.
  expect(view.querySelector('.challenges-chip[aria-selected="true"]')?.textContent).toBe("À venir1");
  expect(view.querySelector(".challenges-active")?.textContent).toContain("×1,5 en équipe");
  expect(view.querySelector(".challenges-active")?.textContent).toContain("Commence lundi 30 nov.");
  await openSection(view, "Découvrir");
  expect(view.querySelectorAll(".challenges-join")).toHaveLength(3);
});

it("lets Stevie find a team when you have none", async () => {
  const view = await mount();
  await openSection(view, "Découvrir");
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

it("splits my challenges into ongoing, upcoming and history", async () => {
  const view = await mount();
  expect(view.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Mes défis");
  expect(view.textContent).toContain("Aucun défi en cours pour le moment.");
  await openSection(view, "Historique");
  const rows = [...view.querySelectorAll(".challenges-history li")].map((row) => row.textContent);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain("Terminé le 9 novembre");
  expect(rows[0]).toContain("+150");

  await openSection(view, "Découvrir");
  const steps = [...view.querySelectorAll(".challenges-item")].find((row) => row.textContent?.includes("10 000 pas"));
  const join = steps?.querySelector(".challenges-join");
  if (!(join instanceof HTMLButtonElement)) throw new Error("missing steps join");
  await act(async () => join.click());
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  await act(async () => button(sheet, "Seul·e pour l’instant").click());
  await act(async () => button(sheet, "Voir mes défis").click());
  expect(view.querySelector('.challenges-chip[aria-selected="true"]')?.textContent).toBe("En cours1");
  expect(view.querySelector(".challenges-active")?.textContent).toContain("Jour 8 sur 14");
  expect(view.querySelectorAll('.challenges-days li[data-state="done"]')).toHaveLength(7);
});

it("shows friends' challenges, joins one with them and adds a new friend", async () => {
  const view = await mount();
  await openSection(view, "Amis");
  expect(view.textContent).toContain("Mes amis · 3");
  const lea = [...view.querySelectorAll(".friends-head")].find((item) => item.textContent?.includes("Léa"));
  if (!(lea instanceof HTMLButtonElement)) throw new Error("missing Léa");
  await act(async () => lea.click());
  expect(view.querySelector(".friends-detail")?.textContent).toContain("Sommeil 7 × 7");
  await act(async () => button(view, "Le rejoindre").click());
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  await act(async () => button(sheet, "Oui, avec Léa").click());
  await act(async () => button(sheet, "Voir mes défis").click());
  expect(view.querySelector(".challenges-active")?.textContent).toContain("Sommeil 7 × 7");

  await openSection(view, "Amis");
  await act(async () => button(view, "+ Ajouter").click());
  const sami = [...view.querySelectorAll(".friends-row")].find((row) => row.textContent?.includes("Sami"));
  const add = sami?.querySelector("button");
  if (!(add instanceof HTMLButtonElement)) throw new Error("missing add button");
  await act(async () => add.click());
  expect(view.textContent).toContain("Mes amis · 4");
  expect(view.querySelector(".friends-add")?.textContent).not.toContain("Sami");
});

it("creates a private challenge from Découvrir and lists it under À venir", async () => {
  const view = await mount();
  await openSection(view, "Découvrir");
  await act(async () => button(view, "Créer").click());
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing create sheet");
  await act(async () => button(sheet, "Créer le défi").click());
  expect(sheet.querySelector('[role="alert"]')?.textContent).toContain("au moins 3 caractères");
  const [name, goal] = [...sheet.querySelectorAll("input")];
  if (!(name instanceof HTMLInputElement) || !(goal instanceof HTMLInputElement)) throw new Error("missing fields");
  await act(async () => setField(name, "Marche du midi"));
  await act(async () => setField(goal, "20 minutes de marche"));
  await act(async () => button(sheet, "14 jours").click());
  await act(async () => button(sheet, "Inès").click());
  await act(async () => button(sheet, "Créer le défi").click());
  expect(view.querySelector('[role="dialog"]')).toBeNull();
  expect(view.querySelector('.challenges-chip[aria-selected="true"]')?.textContent).toBe("À venir1");
  const card = view.querySelector(".challenges-active")?.textContent ?? "";
  expect(card).toContain("Marche du midi");
  expect(card).toContain("créé par toi");
  expect(card).toContain("Défi perso · privé");
  expect(card).not.toContain("Berries");
  await openSection(view, "Découvrir");
  expect(view.textContent).not.toContain("Marche du midi");
});

function setField(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
