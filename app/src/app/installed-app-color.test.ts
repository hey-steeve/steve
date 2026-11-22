// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { viewport as chatViewport } from "./chat/layout.js";
import ChatPage from "./chat/chat-page.js";
import RootLayout, { viewport } from "./layout.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const page = "#eff1fe";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(appDir, "../../..");
const manifestPath = path.join(repoRoot, "shared/assets/brand/site.webmanifest");

it("matches the installed app to the flat page background", async () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    theme_color: string;
    background_color: string;
  };
  expect(designTokens.color.page).toBe(page);
  expect(manifest.theme_color).toBe(page);
  expect(manifest.background_color).toBe(page);
  expect(viewport.themeColor).toBe(page);
  expect(chatViewport.themeColor).toBe(page);

  const style = document.createElement("style");
  style.textContent = [
    readFileSync(path.join(appDir, "globals.css"), "utf8"),
    readFileSync(path.join(appDir, "chat/chat.css"), "utf8"),
  ].join("\n");
  document.head.append(style);

  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );

  await mount(createElement(RootLayout, null, createElement(ChatPage)));

  const screen = document.querySelector(".chat-page");
  if (!(screen instanceof HTMLElement)) {
    throw new Error("missing chat page");
  }
  const painted = {
    backgroundColor: channels(page),
    backgroundImage: "none",
  };
  expect(flat(document.documentElement)).toEqual(painted);
  expect(flat(document.body)).toEqual(painted);
  expect(flat(screen)).toEqual(painted);
});

function flat(element: Element): { backgroundColor: string; backgroundImage: string } {
  const style = getComputedStyle(element);
  return {
    backgroundColor: channels(style.backgroundColor),
    backgroundImage:
      style.backgroundImage === "" ||
      style.backgroundImage === "none" ||
      style.backgroundImage === "initial"
        ? "none"
        : style.backgroundImage,
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

async function mount(node: ReturnType<typeof createElement>): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
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
