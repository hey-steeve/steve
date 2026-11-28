// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import ChatPage from "./chat-page.js";

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

it("stacks the home cards in order under the greeting", async () => {
  const view = await mount();
  const actions = view.querySelector(".chat-home-actions");
  const order = [...(actions?.children ?? [])].map((child) => child.className);
  expect(order).toEqual([
    "chat-home-card home-signal",
    "chat-home-appt",
    "chat-home-card home-challenge",
    "chat-home-card chat-home-space",
    "chat-home-card chat-home-upcoming",
    "chat-home-tiles",
    "home-customize-open",
  ]);
  expect(view.querySelector(".chat-home-dock")).toBeNull();
  expect(view.querySelector(".chat-home-chip")?.textContent).toBe("Dans 5 jours");
  expect(view.querySelector(".chat-home-appt-name")?.textContent).toBe("Dr Camille Lunéval");
  expect(view.querySelector(".chat-home-appt-foot")?.textContent).toBe("Mer. 2 déc.10:00");
  expect(view.querySelector(".chat-home-stats")?.textContent).toBe(
    "1document1rappel2messages",
  );
});

it("reaches every Stevie space from the home screen", async () => {
  const view = await mount();
  const hrefs = new Set(
    [...view.querySelectorAll("a")].map((link) => link.getAttribute("href")),
  );
  for (const href of [
    "/chat",
    "/directory",
    "/booking",
    "/agenda",
    "/profile",
    "/vault",
    "/reminders",
    "/inbox",
  ]) {
    expect(hrefs.has(href)).toBe(true);
  }
  const tabs = [...view.querySelectorAll('nav[aria-label="Espaces Stevie"] a')];
  expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
    "Accueil",
    "Défis",
    "Agenda",
    "Mon profil",
  ]);
  expect(tabs[0]?.getAttribute("aria-current")).toBe("page");
});

it("hides the appointment card when dismissed", async () => {
  const view = await mount();
  const close = view.querySelector('button[aria-label="Masquer le rendez-vous"]');
  if (!(close instanceof HTMLButtonElement)) {
    throw new Error("missing dismiss button");
  }
  await act(async () => close.click());
  expect(view.querySelector(".chat-home-appt")).toBeNull();
  expect(view.querySelector(".chat-home-ask")).toBeNull();
  expect(view.querySelector(".chat-home-signal, .home-signal")).not.toBeNull();
});

it("opens the notification list from the bell without leaving the home", async () => {
  const view = await mount();
  const bell = view.querySelector('button[aria-label="Notifications, 3 nouvelles"]');
  if (!(bell instanceof HTMLButtonElement)) {
    throw new Error("missing bell");
  }
  await act(async () => bell.click());
  const panel = view.querySelector('[role="dialog"][aria-label="Notifications"]');
  expect(bell.getAttribute("aria-expanded")).toBe("true");
  expect(bell.getAttribute("aria-label")).toBe("Notifications");
  expect(view.querySelector(".chat-home-glass-dot")).toBeNull();
  expect([...(panel?.querySelectorAll(".chat-home-notif strong") ?? [])].map((n) => n.textContent)).toEqual([
    "Rendez-vous confirmé",
    "Document du cabinet",
    "Rappel programmé",
  ]);
  expect([...(panel?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
    "/agenda",
    "/inbox",
    "/reminders",
  ]);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(view.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(bell);
});

it("opens the account menu and closes it from the backdrop", async () => {
  const view = await mount("Peter");
  const account = view.querySelector('button[aria-label="Mon compte"]');
  if (!(account instanceof HTMLButtonElement)) {
    throw new Error("missing account button");
  }
  await act(async () => account.click());
  const panel = view.querySelector('[role="dialog"][aria-label="Mon compte"]');
  expect(panel?.querySelector(".chat-home-account-head strong")?.textContent).toBe("Peter");
  expect([...(panel?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
    "/profile",
    "/vault",
    "/reminders",
    "/inbox",
  ]);
  const backdrop = view.querySelector(".chat-home-pop-backdrop");
  if (!(backdrop instanceof HTMLButtonElement)) {
    throw new Error("missing backdrop");
  }
  await act(async () => backdrop.click());
  expect(view.querySelector('[role="dialog"]')).toBeNull();
});

async function mount(patientFirstName?: string): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ChatPage, patientFirstName === undefined ? {} : { patientFirstName }));
  });
  return container;
}

it("lets the person reorder and hide home blocks and remembers it", async () => {
  window.localStorage.removeItem("steve.home.layout.v1");
  const view = await mount("Peter");
  const firstCard = () => {
    const first = view.querySelector(".chat-home-actions")?.firstElementChild;
    return first?.getAttribute("aria-labelledby") ?? first?.getAttribute("aria-label");
  };
  expect(firstCard()).toBe("home-signal-title");
  const open = [...view.querySelectorAll("button")].find((item) => item.textContent === "Personnaliser l’accueil");
  if (!(open instanceof HTMLButtonElement)) throw new Error("missing customise button");
  await act(async () => open.click());
  const sheet = document.querySelector('[role="dialog"][aria-labelledby="home-custom-title"]');
  if (!(sheet instanceof HTMLElement)) throw new Error("missing sheet");
  const down = sheet.querySelector('[aria-label="Descendre Ton sommeil"]');
  const hide = sheet.querySelector('[aria-label="Afficher Mon espace santé"]');
  if (!(down instanceof HTMLButtonElement) || !(hide instanceof HTMLButtonElement)) throw new Error("missing controls");
  expect(sheet.querySelector('[aria-label="Monter Ton sommeil"]')?.hasAttribute("disabled")).toBe(true);
  await act(async () => down.click());
  await act(async () => hide.click());
  expect(hide.getAttribute("aria-checked")).toBe("false");
  expect(firstCard()).toBe("Prochain rendez-vous");
  expect(view.querySelector("#chat-home-space-title")).toBeNull();
  expect(JSON.parse(window.localStorage.getItem("steve.home.layout.v1") ?? "{}")).toMatchObject({ hidden: ["space"] });

  const reset = [...sheet.querySelectorAll("button")].find((item) => item.textContent === "Revenir à l’ordre par défaut");
  if (!(reset instanceof HTMLButtonElement)) throw new Error("missing reset");
  await act(async () => reset.click());
  expect(firstCard()).toBe("home-signal-title");
  expect(view.querySelector("#chat-home-space-title")).not.toBeNull();
  window.localStorage.removeItem("steve.home.layout.v1");
});
