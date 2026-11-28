// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { SearchBar } from "./search-bar.js";

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

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("opens a full-screen search, shows grouped results and closes on Annuler", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(createElement(SearchBar)));
  const pill = container.querySelector(".app-search-pill");
  if (!(pill instanceof HTMLButtonElement)) throw new Error("missing pill");
  await act(async () => pill.click());
  const input = container.querySelector('.app-search input');
  if (!(input instanceof HTMLInputElement)) throw new Error("missing input");
  expect(document.activeElement).toBe(input);
  expect(container.textContent).toContain("Suggestions");

  await act(async () => setInput(input, "sommeil"));
  expect([...container.querySelectorAll(".app-search-group")].map((node) => node.textContent)).toEqual(["Défis"]);
  expect(container.querySelector(".app-search-item")?.getAttribute("href")).toBe("/challenges?join=sleep-7x7");

  await act(async () => setInput(input, "zzz"));
  expect(container.querySelector(".app-search-empty")?.textContent).toBe("Aucun résultat pour « zzz ».");

  const cancel = container.querySelector(".app-search-cancel");
  if (!(cancel instanceof HTMLButtonElement)) throw new Error("missing cancel");
  await act(async () => cancel.click());
  expect(container.querySelector(".app-search")).toBeNull();
  expect(document.activeElement).toBe(pill);
});
