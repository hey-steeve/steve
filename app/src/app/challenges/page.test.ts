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
  expect(view.querySelector("h1")?.textContent).toBe("Challenges");
  expect(view.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe("/mascot/running.webp");
  await openSection(view, "Discover");
  expect(view.textContent).toContain("Sleep 7 × 7");
  expect(view.textContent).toContain("No team?");
  expect(view.querySelectorAll(".challenges-join")).toHaveLength(4);
});

it("joins a challenge with a friend through Stevie and multiplies the reward", async () => {
  const view = await mount();
  await openSection(view, "Discover");
  const first = view.querySelector(".challenges-join");
  if (!(first instanceof HTMLButtonElement)) throw new Error("missing join button");
  await act(async () => {
    first.click();
  });
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  expect(sheet.textContent).toContain("Léa is doing it too");
  await act(async () => {
    button(sheet, "Yes, with Léa").click();
  });
  expect(sheet.textContent).toContain("You’re in");
  expect(sheet.textContent).toContain("150 Berries to win");
  expect(sheet.textContent).toContain("we pause the challenge");
  await act(async () => {
    button(sheet, "See my challenges").click();
  });
  expect(view.querySelector('[role="dialog"]')).toBeNull();
  // Sleep 7 × 7 starts on Monday, so it lands under Upcoming.
  expect(view.querySelector('.challenges-chip[aria-selected="true"]')?.textContent).toBe("Upcoming1");
  expect(view.querySelector(".challenges-active")?.textContent).toContain("×1.5 as a team");
  expect(view.querySelector(".challenges-active")?.textContent).toContain("Starts Monday 30 Nov");
  await openSection(view, "Discover");
  expect(view.querySelectorAll(".challenges-join")).toHaveLength(3);
});

it("lets Stevie find a team when you have none", async () => {
  const view = await mount();
  await openSection(view, "Discover");
  await act(async () => {
    button(view, "Find me a team").click();
  });
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  await act(async () => {
    button(sheet, "Find me a team").click();
  });
  expect(sheet.textContent).toContain("I found Inès and Marc");
});

it("splits my challenges into ongoing, upcoming and history", async () => {
  const view = await mount();
  expect(view.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("My challenges");
  expect(view.textContent).toContain("No ongoing challenge for now.");
  await openSection(view, "History");
  const rows = [...view.querySelectorAll(".challenges-history li")].map((row) => row.textContent);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toContain("Completed 9 November");
  expect(rows[0]).toContain("+150");

  await openSection(view, "Discover");
  const steps = [...view.querySelectorAll(".challenges-item")].find((row) => row.textContent?.includes("10,000 steps"));
  const join = steps?.querySelector(".challenges-join");
  if (!(join instanceof HTMLButtonElement)) throw new Error("missing steps join");
  await act(async () => join.click());
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  await act(async () => button(sheet, "Solo for now").click());
  await act(async () => button(sheet, "See my challenges").click());
  expect(view.querySelector('.challenges-chip[aria-selected="true"]')?.textContent).toBe("Ongoing1");
  expect(view.querySelector(".challenges-active")?.textContent).toContain("Day 8 of 14");
  expect(view.querySelectorAll('.challenges-days li[data-state="done"]')).toHaveLength(7);
});

it("shows friends' challenges, joins one with them and adds a new friend", async () => {
  const view = await mount();
  await openSection(view, "Friends");
  expect(view.textContent).toContain("My friends · 3");
  const lea = [...view.querySelectorAll(".friends-head")].find((item) => item.textContent?.includes("Léa"));
  if (!(lea instanceof HTMLButtonElement)) throw new Error("missing Léa");
  await act(async () => lea.click());
  expect(view.querySelector(".friends-detail")?.textContent).toContain("Sleep 7 × 7");
  await act(async () => button(view, "Join them").click());
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing join sheet");
  await act(async () => button(sheet, "Yes, with Léa").click());
  await act(async () => button(sheet, "See my challenges").click());
  expect(view.querySelector(".challenges-active")?.textContent).toContain("Sleep 7 × 7");

  await openSection(view, "Friends");
  await act(async () => button(view, "+ Add").click());
  const sami = [...view.querySelectorAll(".friends-row")].find((row) => row.textContent?.includes("Sami"));
  const add = sami?.querySelector("button");
  if (!(add instanceof HTMLButtonElement)) throw new Error("missing add button");
  await act(async () => add.click());
  expect(view.textContent).toContain("My friends · 4");
  expect(view.querySelector(".friends-add")?.textContent).not.toContain("Sami");
});

it("creates a private challenge from Discover and lists it under Upcoming", async () => {
  const view = await mount();
  await openSection(view, "Discover");
  await act(async () => button(view, "Create").click());
  const sheet = view.querySelector('[role="dialog"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing create sheet");
  await act(async () => button(sheet, "Create challenge").click());
  expect(sheet.querySelector('[role="alert"]')?.textContent).toContain("at least 3 characters");
  const [name, goal] = [...sheet.querySelectorAll("input")];
  if (!(name instanceof HTMLInputElement) || !(goal instanceof HTMLInputElement)) throw new Error("missing fields");
  await act(async () => setField(name, "Marche du midi"));
  await act(async () => setField(goal, "20 minutes de marche"));
  await act(async () => button(sheet, "14 days").click());
  await act(async () => button(sheet, "Inès").click());
  await act(async () => button(sheet, "Create challenge").click());
  expect(view.querySelector('[role="dialog"]')).toBeNull();
  expect(view.querySelector('.challenges-chip[aria-selected="true"]')?.textContent).toBe("Upcoming1");
  const card = view.querySelector(".challenges-active")?.textContent ?? "";
  expect(card).toContain("Marche du midi");
  expect(card).toContain("created by you");
  expect(card).toContain("Personal challenge · private");
  expect(card).not.toContain("Berries");
  await openSection(view, "Discover");
  expect(view.textContent).not.toContain("Marche du midi");
});

function setField(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
