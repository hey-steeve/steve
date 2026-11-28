// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import RootLayout from "../layout.js";
import ChatPage from "./chat-page.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("puts Steve and the quick links in the home header and the greeting in the hero", async () => {
  const style = document.createElement("style");
  style.textContent = chatCss;
  document.head.append(style);
  try {
    const view = await mount(
      createElement(
        RootLayout,
        null,
        createElement(ChatPage, { patientFirstName: "Peter" }),
      ),
    );
    const page = view.container.querySelector(".chat-page");
    const header = view.container.querySelector(".chat-header-home");
    const greeting = view.container.querySelector(".chat-hero .chat-home-brand .chat-greeting");
    if (
      !(page instanceof HTMLElement) ||
      !(header instanceof HTMLElement) ||
      !(greeting instanceof HTMLElement)
    ) {
      throw new Error("missing home header or hero greeting");
    }
    expect(page.classList.contains("chat-page-home")).toBe(true);
    expect(header.querySelector(".chat-greeting")).toBeNull();
    expect(header.querySelector(".chat-profile")).toBeNull();
    expect(header.querySelector(".chat-home-logo img")?.getAttribute("alt")).toBe("Steve");
    expect(header.querySelectorAll("a")).toHaveLength(0);
    const buttons = [...header.querySelectorAll("button")].map((button) => [
      button.getAttribute("aria-label"),
      button.getAttribute("aria-expanded"),
    ]);
    expect(buttons).toEqual([
      ["Notifications, 3 nouvelles", "false"],
      ["Mon compte", "false"],
    ]);
    expect(greeting.textContent).toBe("Bonjour Peter,");
    const row = getComputedStyle(header);
    expect(row.display).toBe("flex");
    expect(row.alignItems).toBe("center");
    expect(row.justifyContent).toBe("space-between");
    const greetingStyle = getComputedStyle(greeting);
    expect(greetingStyle.fontWeight).toBe(
      String(designTokens.font.weight.heading),
    );
    expect(greetingStyle.fontSize).toBe("40px");
    expect(greetingStyle.whiteSpace).not.toBe("nowrap");
    expect(designTokens.space[3]).toBe("12px");
    const published = getComputedStyle(document.documentElement)
      .getPropertyValue("--space-3")
      .trim();
    expect(published).toBe(designTokens.space[3]);
    expect(row.columnGap).toBe(designTokens.space[3]);
  } finally {
    style.remove();
    document.documentElement.removeAttribute("style");
  }
});

it("reads the first name from the page seam and falls back to Bonjour", async () => {
  const empty = await mount();
  expect(empty.container.querySelector(".chat-greeting")?.textContent).toBe("Bonjour");
  expect(empty.container.querySelector(".chat-header-home .chat-profile")).toBeNull();

  const named = await mount(createElement(ChatPage, { patientFirstName: "Maximilien" }));
  expect(named.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour Maximilien,",
  );
  expect(named.container.querySelector('[aria-label="Retour"]')).toBeNull();
  const peter = await mount(createElement(ChatPage, { patientFirstName: "Peter" }));
  expect(peter.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour Peter,",
  );
});

async function mount(
  node: ReturnType<typeof createElement> = createElement(ChatPage),
): Promise<{ container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return { container };
}

const roots: Root[] = [];
