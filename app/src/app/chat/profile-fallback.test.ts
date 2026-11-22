// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../chat/demo-user-avatar.js", () => ({
  demoUserAvatarSrc: undefined,
}));

import ChatPage from "./chat-page.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("keeps the profile glyph when no demo avatar is set", async () => {
  const view = await mount();
  const button = view.container.querySelector(".chat-header-home .chat-profile");
  const face = button?.querySelector(".chat-profile-face");
  if (!(button instanceof HTMLButtonElement) || !(face instanceof HTMLElement)) {
    throw new Error("missing profile");
  }
  expect(button.getAttribute("aria-label")).toBe("Profil");
  expect(face.querySelector("img")).toBeNull();
  expect(face.querySelector("svg")).not.toBeNull();
});

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
