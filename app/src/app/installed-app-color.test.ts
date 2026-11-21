// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { viewport as chatViewport } from "./chat/layout.js";
import ChatPage from "./chat/page.js";
import RootLayout, { viewport } from "./layout.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const lavenderTop = designTokens.color.lavenderTop;
const lavenderBottom = designTokens.color.lavenderBottom;

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(appDir, "../../..");
const manifestPath = path.join(repoRoot, "shared/assets/brand/site.webmanifest");

it("matches the installed app to the top of the page gradient", async () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    theme_color: string;
    background_color: string;
  };
  expect(manifest.theme_color).toBe(lavenderTop);
  expect(manifest.background_color).toBe(lavenderTop);
  expect(viewport.themeColor).toBe(lavenderTop);
  expect(chatViewport.themeColor).toBe(lavenderTop);

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

  const page = document.querySelector(".chat-page");
  if (!(page instanceof HTMLElement)) {
    throw new Error("missing chat page");
  }
  const painted = {
    top: channels(lavenderTop),
    bottom: channels(lavenderBottom),
  };
  expect(verticalStops(getComputedStyle(document.documentElement).backgroundImage)).toEqual(
    painted,
  );
  expect(verticalStops(getComputedStyle(document.body).backgroundImage)).toEqual(painted);
  expect(verticalStops(getComputedStyle(page).backgroundImage)).toEqual(painted);
});

function verticalStops(image: string): { top: string; bottom: string } {
  const match = /^linear-gradient\(\s*to bottom\s*,\s*([\s\S]*)\)$/i.exec(image.trim());
  if (match === null) {
    return { top: image, bottom: image };
  }
  const stops = splitStops(match[1] ?? "");
  const first = stops[0] ?? "";
  const last = stops[stops.length - 1] ?? "";
  return { top: channels(stopColor(first)), bottom: channels(stopColor(last)) };
}

function splitStops(value: string): string[] {
  const stops: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    if (char === "," && depth === 0) {
      stops.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") {
    stops.push(current);
  }
  return stops;
}

function stopColor(stop: string): string {
  const trimmed = stop.trim();
  const rgb = /^(rgba?\([^)]*\))/i.exec(trimmed);
  if (rgb !== null) {
    return rgb[1] ?? trimmed;
  }
  const hex = /^(#[0-9a-f]{3,8})/i.exec(trimmed);
  if (hex !== null) {
    return hex[1] ?? trimmed;
  }
  return trimmed.split(/\s+/)[0] ?? trimmed;
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
