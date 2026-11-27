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
  expect(tabIndexFor("/vault")).toBe(2);
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
  firstPaint.innerHTML = renderToStaticMarkup(createElement(AppTabBar, { current: "/vault" }));
  expect(indicator(firstPaint)).toContain("0 * var(--app-tab-step)");

  const second = await mount("/vault");
  await nextFrame();
  expect(indicator(second)).toContain("2 * var(--app-tab-step)");
  expect(second.querySelector('.app-tab[aria-current="page"]')?.getAttribute("href")).toBe("/vault");
});

it("hides the indicator on pages outside the tabs and links the button to Steve", async () => {
  const view = await mount("/directory");
  await nextFrame();
  expect(view.querySelector(".app-tab-indicator")?.hasAttribute("data-hidden")).toBe(true);
  expect(view.querySelector('.app-tab[aria-current="page"]')).toBeNull();
  expect(view.querySelector(".app-tab-fab")?.getAttribute("href")).toBe("/chat");
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
