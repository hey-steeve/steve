// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { viewport } from "./chat/layout.js";
import ChatPage from "./chat/page.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const pageBackground = designTokens.color.indigo50;

const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

it("pins theme-color to the chat page background", () => {
  expect(viewport.themeColor).toBe(pageBackground);
});

it("paints the home screen and the chat screen with that page background", async () => {
  const style = document.createElement("style");
  style.textContent = chatCss;
  document.head.append(style);
  document.documentElement.style.setProperty("--color-indigo-50", pageBackground);
  document.documentElement.style.setProperty(
    "--color-indigo-100",
    designTokens.color.indigo100,
  );

  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );

  const view = await mount();
  const home = pageOf(view.container);
  expect(paint(home)).toEqual({
    backgroundColor: channels(pageBackground),
    backgroundImage: "none",
  });

  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }
  await act(async () => {
    chip.click();
  });

  const chat = pageOf(view.container);
  expect(paint(chat)).toEqual({
    backgroundColor: channels(pageBackground),
    backgroundImage: "none",
  });
});

function pageOf(container: ParentNode): HTMLElement {
  const page = container.querySelector(".chat-page");
  if (!(page instanceof HTMLElement)) {
    throw new Error("missing chat page");
  }
  return page;
}

function paint(page: HTMLElement): {
  backgroundColor: string;
  backgroundImage: string;
} {
  const style = getComputedStyle(page);
  return {
    backgroundColor: channels(style.backgroundColor),
    backgroundImage:
      style.backgroundImage === "initial" ? "none" : style.backgroundImage,
  };
}

function channels(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex !== null) {
    const value = hex[1] ?? "";
    return rgb(
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    );
  }
  const match =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(
      color,
    );
  if (match === null) {
    return color;
  }
  return rgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

function rgb(red: number, green: number, blue: number): string {
  return `rgb(${red}, ${green}, ${blue})`;
}

async function mount(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ChatPage));
  });
  return { container, root };
}

const roots: Root[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
});
