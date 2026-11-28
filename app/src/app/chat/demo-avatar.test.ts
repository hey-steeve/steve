// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { demoUserAvatarSrc } from "../../chat/demo-user-avatar.js";
import ChatPage from "./chat-page.js";
import { writingField } from "./test-writing.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("does not render the user's photo in the home header", async () => {
  expect(demoUserAvatarSrc).toBe("/demo/user-avatar.webp");
  const view = await mount();
  expect(view.container.querySelector(".chat-header-home .chat-profile")).toBeNull();
  const photos = [...view.container.querySelectorAll(".chat-header-home img")];
  expect(photos.map((img) => img.getAttribute("src"))).toEqual(["/mascot/pfp-lavender-profile.webp"]);
});

it("shows the demo photo on the user message avatar", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  const view = await mount();
  const field = writingField(view.container);
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("missing composer");
  }
  await act(async () => {
    setField(field, "Bonjour");
  });
  const send = view.container.querySelector('button[aria-label="Envoyer"]');
  if (!(send instanceof HTMLButtonElement)) throw new Error("missing send button");
  await act(async () => send.click());
  const avatar = view.container.querySelector(".chat-row-user .chat-avatar-user");
  const photo = avatar?.querySelector("img");
  if (!(avatar instanceof HTMLElement) || !(photo instanceof HTMLImageElement)) {
    throw new Error("missing user avatar photo");
  }
  expect(photo.getAttribute("src")).toBe(demoUserAvatarSrc);
  expect(photo.getAttribute("alt")).toBe("");
  expect(avatar.querySelector("svg")).toBeNull();
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

function setField(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
}
