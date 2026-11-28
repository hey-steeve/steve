// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("../../chat/demo-user-avatar.js", () => ({
  demoUserAvatarSrc: undefined,
}));

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

it("keeps the home header clear when no profile action is part of the layout", async () => {
  const view = await mount();
  expect(view.container.querySelector(".chat-header-home .chat-profile")).toBeNull();
});

it("keeps the message glyph when no demo avatar is set", async () => {
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
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(field, "Hello");
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  const send = view.container.querySelector('button[aria-label="Send"]');
  if (!(send instanceof HTMLButtonElement)) throw new Error("missing send button");
  await act(async () => send.click());
  const avatar = view.container.querySelector(".chat-row-user .chat-avatar-user");
  if (!(avatar instanceof HTMLElement)) {
    throw new Error("missing user avatar");
  }
  expect(avatar.querySelector("img")).toBeNull();
  expect(avatar.querySelector("svg")).not.toBeNull();
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
