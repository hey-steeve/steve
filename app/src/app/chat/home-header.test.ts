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

it("places the Alan-style greeting in the home header without a profile photo", async () => {
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
    const header = view.container.querySelector(".chat-header-home");
    const brand = header?.querySelector(":scope > .chat-home-brand");
    const greeting = header?.querySelector(".chat-greeting");
    if (
      !(header instanceof HTMLElement) ||
      !(brand instanceof HTMLElement) ||
      !(greeting instanceof HTMLElement)
    ) {
      throw new Error("missing home header row");
    }
    expect(brand.textContent).toContain("Bonjour Peter,");
    expect(header.querySelector(".chat-profile")).toBeNull();
    expect(greeting.textContent).toBe("Bonjour Peter,");
    const row = getComputedStyle(header);
    expect(row.display).toBe("flex");
    expect(["", "row"]).toContain(row.flexDirection);
    expect(row.alignItems).toBe("center");
    expect(row.justifyContent).toBe("space-between");
    expect(getComputedStyle(greeting).position).toBe("relative");
    const greetingStyle = getComputedStyle(greeting);
    expect(greetingStyle.fontWeight).toBe(
      String(designTokens.font.weight.heading),
    );
    expect(greetingStyle.fontSize).toBe("28px");
    expect(greetingStyle.textOverflow).toBe("ellipsis");
    expect(designTokens.space[3]).toBe("12px");
    const published = getComputedStyle(document.documentElement)
      .getPropertyValue("--space-3")
      .trim();
    expect(published).toBe(designTokens.space[3]);
    expect(row.columnGap).toBe(designTokens.space[3]);
    header.style.setProperty("--space-3", "21px");
    expect(getComputedStyle(header).columnGap).toBe("21px");
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
