// @vitest-environment happy-dom

import { loadDemoPatientMemory } from "@steve/profile";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import Page from "./page.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("renders Hello Peter from the demo profile", async () => {
  const givenName = loadDemoPatientMemory().identity.givenName;
  const view = await mount();
  const greeting = view.container.querySelector(".chat-greeting")?.textContent;
  expect(greeting).toBe("Hello Peter,");
  expect(greeting).toBe(`Hello ${givenName},`);
});

async function mount(): Promise<{ container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(Page));
  });
  return { container };
}

const roots: Root[] = [];
