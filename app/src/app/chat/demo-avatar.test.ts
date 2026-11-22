// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { demoUserAvatarSrc } from "../../chat/demo-user-avatar.js";
import ChatPage from "./chat-page.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const avatarPath = path.join(appDir, "public/demo/user-avatar.webp");
const chatCss = readFileSync(path.join(appDir, "src/app/chat/chat.css"), "utf8");
const circlePx = 32;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("shows the demo photo in the profile frame and keeps the glyph's tap target", async () => {
  expect(demoUserAvatarSrc).toBe("/demo/user-avatar.webp");
  const view = await mount();
  const button = view.container.querySelector(".chat-header-home .chat-profile");
  const photo = button?.querySelector(".chat-profile-photo");
  if (!(button instanceof HTMLButtonElement) || !(photo instanceof HTMLImageElement)) {
    throw new Error("missing profile photo");
  }
  expect(button.getAttribute("aria-label")).toBe("Profil");
  expect(photo.getAttribute("src")).toBe(demoUserAvatarSrc);
  expect(photo.getAttribute("alt")).toBe("");
  expect(button.querySelector("svg")).toBeNull();
  expect(rule(chatCss, ".chat-profile")).toContain("width: var(--hit-min);");
  expect(rule(chatCss, ".chat-profile")).toContain("height: var(--hit-min);");
  expect(rule(chatCss, ".chat-profile-face")).toContain("width: 32px;");
  expect(rule(chatCss, ".chat-profile-face")).toContain("height: 32px;");
  expect(rule(chatCss, ".chat-profile-face")).toContain("background: var(--color-profile);");
  expect(rule(chatCss, ".chat-profile-face")).toContain("border-radius: var(--radius-sm);");
  expect(rule(chatCss, ".chat-profile-photo")).toContain("border-radius: var(--radius-sm);");
  expect(rule(chatCss, ".chat-profile-photo")).toContain("object-fit: cover;");

  const meta = await sharp(readFileSync(avatarPath)).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(meta.height);
  expect(meta.width).toBeGreaterThanOrEqual(circlePx * 3);
  expect(photo.getAttribute("width")).toBe(String(meta.width));
  expect(photo.getAttribute("height")).toBe(String(meta.height));
});

it("shows the demo photo on the user message avatar", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  const view = await mount();
  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }
  await act(async () => {
    chip.click();
  });
  const avatar = view.container.querySelector(".chat-row-user .chat-avatar-user");
  const photo = avatar?.querySelector("img");
  if (!(avatar instanceof HTMLElement) || !(photo instanceof HTMLImageElement)) {
    throw new Error("missing user avatar photo");
  }
  expect(photo.getAttribute("src")).toBe(demoUserAvatarSrc);
  expect(photo.getAttribute("alt")).toBe("");
  expect(avatar.querySelector("svg")).toBeNull();
  expect(rule(chatCss, ".chat-avatar img")).toContain("object-fit: cover;");
});

function rule(css: string, selector: string): string {
  const token = `${selector} {`;
  let from = 0;
  while (from < css.length) {
    const start = css.indexOf(token, from);
    if (start < 0) {
      throw new Error(`missing ${selector}`);
    }
    const prefix = css.slice(Math.max(0, start - 40), start);
    if (!prefix.endsWith(".chat-header-home ")) {
      const end = css.indexOf("}", start);
      if (end < 0) {
        throw new Error(`unclosed ${selector}`);
      }
      return css.slice(start + token.length, end);
    }
    from = start + token.length;
  }
  throw new Error(`missing ${selector}`);
}

async function mount(): Promise<{ container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ChatPage));
  });
  return { container };
}

const roots: Root[] = [];
