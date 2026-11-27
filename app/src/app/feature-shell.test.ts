// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserCallDeps } from "../voice/mock-call.js";
import type { RealtimeSocketOptions } from "../voice/realtime-socket.js";
import ChatPage from "./chat/chat-page.js";
import { FeatureShell, featureNavItems, steveDisclaimer } from "./feature-shell.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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

async function mount(node: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return container;
}

it("renders the shared shell with back navigation, active route, and disclaimer", () => {
  const html = renderToStaticMarkup(
    createElement(
      FeatureShell,
      {
        current: "/agenda",
        title: "Mon agenda",
        badge: "Démonstration",
        headerMascot: { src: "/mascot/state-done.webp", width: 256, height: 256 },
        children: createElement("p", null, "Contenu"),
      },
    ),
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  expect(host.querySelector(".steve-back")?.getAttribute("href")).toBe("/chat");
  expect(host.querySelector("h1")?.textContent).toBe("Mon agenda");
  expect(host.querySelector(".steve-pill")?.textContent).toBe("Démonstration");
  expect(host.querySelector(".steve-header-mascot")?.getAttribute("src")).toBe(
    "/mascot/state-done.webp",
  );
  const current = host.querySelector('.steve-nav-link[aria-current="page"]');
  expect(current?.getAttribute("href")).toBe("/agenda");
  expect(host.querySelector(".steve-disclaimer")?.textContent).toBe(steveDisclaimer);
});

it("lists every feature route from the home screen without adding a header profile control", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  const host = document.createElement("div");
  host.innerHTML = html;
  const hrefs = [...host.querySelectorAll(".chat-home-nav-link")].map((link) =>
    link.getAttribute("href"),
  );
  expect(hrefs).toEqual(
    featureNavItems.filter(({ href }) => href !== "/chat").map(({ href }) => href),
  );
  expect(html).not.toContain('aria-label="Profil"');
});

it("marks urgent replies with the urgent card class and shows the mascot when finished", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        reply: "Appelle le 15 maintenant.",
        mocked: true,
        model: "mock",
        calls: [{ type: "call", number: "15" }],
      }),
    ),
  );
  const container = await mount(createElement(ChatPage));
  const field = container.querySelector("textarea");
  if (!(field instanceof HTMLTextAreaElement)) throw new Error("missing composer");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      field,
      "Douleur forte",
    );
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  const send = container.querySelector('button[aria-label="Envoyer"]');
  if (!(send instanceof HTMLButtonElement)) throw new Error("missing send");
  await act(async () => send.click());

  expect(container.querySelector(".chat-agent.chat-urgent-card")).not.toBeNull();
  const finish = container.querySelector('button[aria-label="Terminer la conversation"]');
  if (!(finish instanceof HTMLButtonElement)) throw new Error("missing finish");
  await act(async () => finish.click());

  expect(container.querySelector(".chat-ended-mascot")?.getAttribute("src")).toBe(
    "/mascot/state-done.webp",
  );
});

it("offers a retry control when a live call is interrupted", async () => {
  let socket: RealtimeSocketOptions | undefined;
  let starts = 0;
  const callDeps = createBrowserCallDeps({
    fetchToken: async () => ({ value: "test" }),
    startAudio: async () => ({
      generation: 0,
      enqueue() {},
      setMuted() {},
      close() {},
      playedMs: () => 0,
      discardResponse() {},
      flush: () => ({ generation: 0, responseId: undefined, itemId: undefined, playedMs: 0 }),
    }),
    connect: (options) => {
      starts += 1;
      socket = options;
      return {
        mock: false,
        sendAudio() {},
        close() {},
        truncate() {},
        cancelResponse() {},
        updateInstructions() {},
        forceMessage() {},
      };
    },
    now: () => 0,
    setTimeout: () => 0,
    clearTimeout() {},
    triage: async () => null,
  });
  const container = await mount(createElement(ChatPage, { callDeps }));
  const callButton = container.querySelector(".chat-call-cta");
  if (!(callButton instanceof HTMLButtonElement)) throw new Error("missing call CTA");
  await act(async () => callButton.click());
  await act(async () => socket?.onOpen?.());
  await act(async () => socket?.onClose?.());

  expect(container.querySelector(".chat-call-error .chat-notice")?.textContent).toBe(
    "L’appel a été interrompu. Réessaie.",
  );
  const retry = container.querySelector(".chat-call-retry");
  if (!(retry instanceof HTMLButtonElement)) throw new Error("missing retry button");
  expect(retry.textContent).toBe("Réessayer");
  await act(async () => retry.click());
  expect(starts).toBe(2);
});
