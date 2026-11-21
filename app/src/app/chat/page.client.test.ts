// @vitest-environment happy-dom

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import ChatPage from "./page.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const fallbackReply = "Je n'ai pas pu répondre. Réessayez.";
const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setField(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

async function renderPage(): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ChatPage));
  });
  return container;
}

function fieldIn(container: ParentNode): HTMLTextAreaElement {
  const field = container.querySelector("textarea");
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("missing composer");
  }
  return field;
}

function sendButton(container: ParentNode): HTMLButtonElement {
  const button = container.querySelector('button[aria-label="Envoyer"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("missing send button");
  }
  return button;
}

it("shows the error and accepts another send when the chat fetch times out", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn<typeof fetch>(async () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  });
  vi.stubGlobal("fetch", fetchMock);
  const container = await renderPage();
  const field = fieldIn(container);

  await act(async () => {
    setField(field, "Bonjour");
  });
  await act(async () => {
    sendButton(container).click();
  });

  expect(timeout).toHaveBeenCalledWith(35_000);
  expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(timeout.mock.results[0]?.value);
  expect(container.textContent).toContain(fallbackReply);

  await act(async () => {
    setField(fieldIn(container), "Encore");
  });
  await act(async () => {
    sendButton(container).click();
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
