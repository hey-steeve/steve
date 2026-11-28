// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { AppTabBar, tabIndexFor } from "./tab-bar.js";

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

it("maps routes to tabs and leaves other pages without one", () => {
  expect(tabIndexFor("/chat")).toBe(0);
  expect(tabIndexFor("/challenges")).toBe(1);
  expect(tabIndexFor("/agenda")).toBe(2);
  expect(tabIndexFor("/vault")).toBeNull();
  expect(tabIndexFor("/directory")).toBeNull();
});

it("starts the indicator on the previous tab, then slides to the current one", async () => {
  const first = await mount("/chat");
  await nextFrame();
  expect(indicator(first)).toContain("0 * var(--app-tab-step)");
  act(() => {
    roots.pop()?.unmount();
  });

  const firstPaint = document.createElement("div");
  firstPaint.innerHTML = renderToStaticMarkup(createElement(AppTabBar, { current: "/agenda" }));
  expect(indicator(firstPaint)).toContain("0 * var(--app-tab-step)");

  const second = await mount("/agenda");
  await nextFrame();
  expect(indicator(second)).toContain("2 * var(--app-tab-step)");
  expect(second.querySelector('.app-tab[aria-current="page"]')?.getAttribute("href")).toBe("/agenda");
});

it("hides the indicator on pages outside the tabs and links the button to Stevie", async () => {
  const view = await mount("/directory");
  await nextFrame();
  expect(view.querySelector(".app-tab-indicator")?.hasAttribute("data-hidden")).toBe(true);
  expect(view.querySelector('.app-tab[aria-current="page"]')).toBeNull();
  expect(view.querySelector(".app-tab-fab")?.getAttribute("href")).toBe("/chat");
});

it("opens the Stevie menu from the round button on the home", async () => {
  const calls: string[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(AppTabBar, {
        current: "/chat",
        stevie: { onWrite: () => calls.push("write"), onCall: () => calls.push("call"), disclaimer: "Démo" },
      }),
    );
  });
  const stevie = container.querySelector(".app-tab-stevie");
  if (!(stevie instanceof HTMLButtonElement)) throw new Error("missing Stevie button");
  expect(stevie.querySelector("img")?.getAttribute("src")).toBe("/mascot/pfp-lavender-profile.webp");
  await act(async () => stevie.click());
  expect(stevie.getAttribute("aria-expanded")).toBe("true");
  const call = container.querySelector(".chat-call-cta");
  if (!(call instanceof HTMLButtonElement)) throw new Error("missing call item");
  await act(async () => call.click());
  expect(calls).toEqual(["call"]);
  expect(container.querySelector("#app-stevie-menu")).toBeNull();
});

function indicator(container: HTMLElement): string {
  const node = container.querySelector(".app-tab-indicator");
  return node instanceof HTMLElement ? node.style.transform : "";
}

async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

async function mount(current: string): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AppTabBar, { current }));
  });
  return container;
}
