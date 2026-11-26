// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatRequestLimits } from "../../chat/request.js";
import * as liveCall from "../../voice/live-call.js";
import { createBrowserCallDeps } from "../../voice/mock-call.js";
import type { RealtimeSocketOptions } from "../../voice/realtime-socket.js";
import { call15Now, call3114Now } from "../api/chat/emergency-templates.js";
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

beforeEach(() => {
  vi.spyOn(history, "pushState");
  vi.spyOn(history, "replaceState");
});

it("renders the home greeting without the removed profile action", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain('class="chat-greeting">Bonjour</h1>');
  expect(html).not.toContain('aria-label="Profil"');
});

it("limits the composer to the user message cap", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain(`maxLength="${chatRequestLimits.maxMessageChars}"`);
});

it("opens the written conversation and returns to the home screen", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  const view = await mount();
  expect(view.container.querySelector('.chat-header [aria-label="Profil"]')).toBeNull();
  const back = await openConversation(view);

  const header = view.container.querySelector(".chat-header");
  expect(header?.querySelector('[aria-label="Profil"]')).toBeNull();
  expect(header?.querySelector('[aria-label="Retour"]')).not.toBeNull();
  expect(header?.querySelector(".chat-title")?.textContent).toContain("Steve");
  expect(header?.querySelector(".chat-title img")?.getAttribute("src")).toBe(
    "/mascot/pfp-lavender-profile.webp",
  );
  expect(
    view.container.querySelector(".chat-avatar-agent img")?.getAttribute("src"),
  ).toBe("/mascot/pfp-lavender-profile.webp");
  expect(header?.querySelector(".chat-header-spacer")).not.toBeNull();
  expect(view.container.querySelector(".chat-avatar-user")).not.toBeNull();
  expect(view.container.querySelector(".chat-avatar-agent")).not.toBeNull();

  await act(async () => {
    back.click();
  });
  expect(view.container.querySelector(".chat-column-leave")).not.toBeNull();
});

it("renders the home greeting", async () => {
  const view = await mount();
  expect(view.container.querySelector(".chat-greeting")?.textContent).toBe("Bonjour");
  expect(view.container.querySelector('[aria-label="Retour"]')).toBeNull();
  expect(view.container.querySelector(".chat-home-mark")).toBeNull();
});

it("shows the bubbles pose on the empty home sheet", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  const host = document.createElement("div");
  host.innerHTML = html;
  const img = host.querySelector(".chat-hero-mascot");
  if (!(img instanceof HTMLImageElement)) {
    throw new Error("missing home hero");
  }
  expect(img.getAttribute("src")).toBe("/mascot/bubbles.webp");
  expect(img.getAttribute("width")).toBe("1137");
  expect(img.getAttribute("height")).toBe("840");
  const heroStart = chatCss.indexOf(".chat-hero-mascot {");
  const heroEnd = chatCss.indexOf("}", heroStart);
  if (heroStart < 0 || heroEnd < 0) {
    throw new Error("missing home hero rule");
  }
  const hero = chatCss.slice(heroStart, heroEnd);
  expect({
    alt: img.getAttribute("alt"),
    overlap: chatCss.includes("--mascot-overlap"),
    width: hero.includes("width: min(320px, calc(100vw - 48px));"),
    left: hero.includes("align-self: flex-start;"),
    top: hero.includes("margin-top: -5px;"),
    align: hero.includes("align-self: center;"),
    fit: hero.includes("object-fit: contain;"),
    clippedTop: hero.includes("-16px"),
    sheet: hero.includes("margin-bottom: calc(284px * (718 - 840) / 1137)"),
    float: chatCss.includes("float"),
    aspect: hero.includes("aspect-ratio: 1137 / 840"),
    shadow: hero.includes("filter:") || hero.includes("box-shadow"),
  }).toEqual({
    alt: "",
    overlap: false,
    width: true,
    left: false,
    top: false,
    align: true,
    fit: true,
    clippedTop: false,
    sheet: false,
    float: false,
    aspect: true,
    shadow: false,
  });
});

it("centers the mascot above the current home actions", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  const host = document.createElement("div");
  host.innerHTML = html;
  const img = host.querySelector(".chat-hero-mascot");
  if (!(img instanceof HTMLImageElement)) {
    throw new Error("missing home hero");
  }
  const heroStart = chatCss.indexOf(".chat-hero-mascot {");
  const heroEnd = chatCss.indexOf("}", heroStart);
  if (heroStart < 0 || heroEnd < 0) {
    throw new Error("missing hero rule");
  }
  const hero = chatCss.slice(heroStart, heroEnd);
  expect({
    width: img.getAttribute("width"),
    height: img.getAttribute("height"),
    aspect: hero.includes("aspect-ratio: 1137 / 840"),
    centered: hero.includes("align-self: center;"),
    responsive: hero.includes("width: min(320px, calc(100vw - 48px));"),
  }).toEqual({
    width: "1137",
    height: "840",
    aspect: true,
    centered: true,
    responsive: true,
  });
});

it("paints the current call card and composer on the home screen", async () => {
  const canvas = designTokens.color.canvas;
  const style = document.createElement("style");
  style.textContent = chatCss;
  document.head.append(style);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  try {
    const view = await mount(
      createElement(RootLayout, null, createElement(ChatPage)),
    );
    const call = view.container.querySelector(".chat-call-cta");
    const composer = view.container.querySelector(".chat-home-dock .chat-composer");
    if (!(call instanceof HTMLElement) || !(composer instanceof HTMLElement)) {
      throw new Error("missing home call card or composer");
    }
    expect(channels(getComputedStyle(call).backgroundColor)).toBe(channels(canvas));
    const homeField = composer.querySelector(".chat-field");
    if (!(homeField instanceof HTMLTextAreaElement)) {
      throw new Error("missing composer field");
    }
    expect(getComputedStyle(homeField).backgroundColor).toBe("transparent");
    expect(channels(getComputedStyle(composer).backgroundColor)).toBe(
      channels(canvas),
    );
    expect(view.container.querySelectorAll(".chat-chip")).toHaveLength(0);
    expect(view.container.querySelector('.chat-header [aria-label="Profil"]')).toBeNull();
    await act(async () => setField(homeField, "Bonjour"));
    const send = view.container.querySelector('button[aria-label="Envoyer"]');
    if (!(send instanceof HTMLButtonElement)) throw new Error("missing send button");
    await act(async () => send.click());
    const dock = view.container.querySelector(
      ".chat-column > .chat-dock .chat-composer .chat-field",
    );
    if (!(dock instanceof HTMLElement)) {
      throw new Error("missing chat composer");
    }
    expect(channels(getComputedStyle(dock).backgroundColor)).toBe(
      channels(canvas),
    );
    expect(getComputedStyle(dock).borderTopWidth).toBe("1px");
  } finally {
    style.remove();
    document.documentElement.removeAttribute("style");
  }
});

it("starts one live call from the home CTA and shows its connection status", async () => {
  const call = await mountCall();
  expect(call.container.querySelector(".chat-thread-call")).toBeNull();
  await clickCallControl(call.container, ".chat-call-cta");
  expect(call.start).toHaveBeenCalledExactlyOnceWith([]);
  expect(call.container.querySelector(".chat-call-bar [role='status']")?.textContent)
    .toBe("Connexion…");
  expect(call.container.querySelectorAll(".chat-thread li")).toHaveLength(0);
  expect(call.container.querySelector(".chat-call-bar img")?.getAttribute("src"))
    .toBe("/demo/steve-call-avatar.webp");
  expect(call.container.querySelector<HTMLButtonElement>(".chat-call-control")?.disabled)
    .toBe(true);
  await call.connect();
  expect(call.container.querySelector(".chat-call-wave")?.getAttribute("data-activity"))
    .toBe("listening");
  await call.emit({ type: "response.created", responseId: "reply" });
  expect(call.container.querySelector(".chat-call-wave")?.getAttribute("data-activity"))
    .toBe("speaking");
  expect(call.container.querySelector(".chat-call-bar-subtitle")?.textContent).toBe("Steve parle");
});

it("starts one live call from the thread header with the current text history", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
    Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
  ));
  const call = await mountCall();
  await openConversation(call);
  await clickCallControl(call.container, ".chat-thread-call");
  expect(call.start).toHaveBeenCalledExactlyOnceWith([
    { role: "user", content: "Bonjour" },
    { role: "assistant", content: "D'accord." },
  ]);
  expect(call.container.querySelector(".chat-thread-call")).toBeNull();
});

it("does not start a live call while leaving the thread", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () =>
    Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
  ));
  const call = await mountCall();
  const back = await openConversation(call);
  await act(async () => back.click());
  await clickCallControl(call.container, ".chat-thread-call");
  expect(call.start).not.toHaveBeenCalled();
});

it("mutes and unmutes the live call and removes the bar on hang-up", async () => {
  const call = await mountCall();
  await clickCallControl(call.container, ".chat-call-cta");
  await call.connect();
  const mute = await clickCallControl(call.container, '[aria-label="Couper le micro"]');
  expect(mute.getAttribute("aria-pressed")).toBe("true");
  expect(call.container.querySelector(".chat-call-bar-subtitle")?.textContent).toBe("Micro coupé");
  await clickCallControl(call.container, '[aria-label="Couper le micro"]');
  expect(call.setMuted.mock.calls).toEqual([[true], [false]]);
  expect(mute.getAttribute("aria-pressed")).toBe("false");
  await clickCallControl(call.container, ".chat-call-end");
  expect(call.end).toHaveBeenCalledExactlyOnceWith("hang-up");
  expect(call.container.querySelector(".chat-call-bar")).toBeNull();
  expect(call.container.querySelector(".chat-call-cta")).not.toBeNull();
});

it("replaces live transcripts in place and keeps emergency sentences and actions visible", async () => {
  const call = await mountCall(async () => ({
    label: "emergency",
    calls: [{ type: "call", number: "3114" }, { type: "call", number: "15" }],
  }));
  await clickCallControl(call.container, ".chat-call-cta");
  await call.connect();
  await call.emit({ type: "input.transcription_updated", itemId: "turn", text: "Brouillon" });
  expect(call.container.querySelector(".chat-user")?.textContent).toBe("Brouillon");
  const toggle = await clickCallControl(call.container, '[aria-label="Afficher la transcription"]');
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(call.container.querySelector(".chat-user")).toBeNull();

  await call.emit({ type: "input.transcription_completed", itemId: "turn", text: "Phrase finale" });
  expect(call.container.querySelector(".chat-user")).toBeNull();
  expect([...call.container.querySelectorAll(".chat-agent-text p")].map((p) => p.textContent))
    .toEqual([call3114Now, call15Now]);
  expect([...call.container.querySelectorAll(".chat-emergency-calls a")].map((link) =>
    [link.textContent, link.getAttribute("href")],
  )).toEqual([["Appeler le 3114", "tel:3114"], ["Appeler le 15", "tel:15"]]);

  await clickCallControl(call.container, '[aria-label="Afficher la transcription"]');
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect([...call.container.querySelectorAll(".chat-user")].map((p) => p.textContent))
    .toEqual(["Phrase finale"]);
  expect(call.container.querySelector(".chat-row-user + .chat-row-agent")).not.toBeNull();
  await call.emit({ type: "input.transcription_updated", itemId: "silence", text: "Début" });
  await call.emit({ type: "input.transcription_completed", itemId: "silence", text: "" });
  expect(call.container.querySelectorAll(".chat-user")).toHaveLength(1);
  await call.emit({ type: "input.transcription_updated", itemId: "draft", text: "Inachevé" });
  expect(call.container.querySelectorAll(".chat-user")).toHaveLength(2);
  await clickCallControl(call.container, '[aria-label="Afficher la transcription"]');
  await clickCallControl(call.container, ".chat-call-end");
  expect([...call.container.querySelectorAll(".chat-user")].map((p) => p.textContent))
    .toEqual(["Phrase finale"]);
  expect(call.container.querySelectorAll(".chat-emergency-calls a")).toHaveLength(2);
  await clickCallControl(call.container, ".chat-thread-call");
  expect(call.start).toHaveBeenLastCalledWith([
    { role: "user", content: "Phrase finale" },
    { role: "assistant", content: `${call3114Now} ${call15Now}` },
  ]);
  await clickCallControl(call.container, '[aria-label="Afficher la transcription"]');
  expect([...call.container.querySelectorAll(".chat-user")].map((p) => p.textContent))
    .toEqual(["Phrase finale"]);
});

it("shows offered phone actions without forcing speech", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
  );
  vi.stubGlobal("fetch", fetch);
  const call = await mountCall(async () => ({
    label: "self-care",
    calls: [{ type: "call", number: "3114" }],
  }));
  await clickCallControl(call.container, ".chat-call-cta");
  await call.connect();
  await call.emit({ type: "input.transcription_completed", itemId: "turn", text: "Je cherche à qui parler" });
  expect(call.container.querySelector('.chat-emergency-calls a[href="tel:3114"]')?.textContent)
    .toBe("Appeler le 3114");
  expect(call.container.querySelector(".chat-agent-text")).toBeNull();
  expect(call.forceMessage).not.toHaveBeenCalled();
  await clickCallControl(call.container, ".chat-call-end");
  await openConversation(call);
  const requestBody: unknown = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
  expect(requestBody).toEqual({ messages: [{ role: "user", content: "Bonjour" }] });
});

async function mountCall(triage?: liveCall.CallDeps["triage"]) {
  const createLiveCall = liveCall.createLiveCall;
  const start = vi.fn<liveCall.LiveCallController["start"]>();
  const setMuted = vi.fn<liveCall.LiveCallController["setMuted"]>();
  const end = vi.fn<liveCall.LiveCallController["end"]>();
  vi.spyOn(liveCall, "createLiveCall").mockImplementation((deps) => {
    const controller = createLiveCall(deps);
    return {
      ...controller,
      start: start.mockImplementation(controller.start),
      setMuted: setMuted.mockImplementation(controller.setMuted),
      end: end.mockImplementation(controller.end),
    };
  });
  let socket: RealtimeSocketOptions | undefined;
  const forceMessage = vi.fn();
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
      socket = options;
      return {
        mock: false,
        sendAudio() {},
        close() {},
        truncate() {},
        cancelResponse() {},
        updateInstructions() {},
        forceMessage,
      };
    },
    now: () => 0,
    setTimeout: () => 0,
    clearTimeout() {},
    triage: triage ?? (async () => null),
  });
  const view = await mount(createElement(ChatPage, { callDeps }));
  function currentSocket() {
    if (socket === undefined) throw new Error("missing live socket");
    return socket;
  }
  return {
    ...view, start, setMuted, end, forceMessage,
    connect: () => act(async () => currentSocket().onOpen?.()),
    emit: (event: Parameters<RealtimeSocketOptions["onEvent"]>[0]) =>
      act(async () => currentSocket().onEvent(event)),
  };
}

async function clickCallControl(container: ParentNode, selector: string) {
  const button = container.querySelector(selector);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`missing call control ${selector}`);
  await act(async () => button.click());
  return button;
}

it("fills each message avatar with its photo and drops the white frame", async () => {
  const style = document.createElement("style");
  style.textContent = chatCss;
  document.head.append(style);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  try {
    const view = await mount(
      createElement(RootLayout, null, createElement(ChatPage)),
    );
    const field = view.container.querySelector(".chat-field");
    if (!(field instanceof HTMLTextAreaElement)) {
      throw new Error("missing composer");
    }
    await act(async () => {
      setField(field, "Bonjour");
    });
    const send = view.container.querySelector('button[aria-label="Envoyer"]');
    if (!(send instanceof HTMLButtonElement)) {
      throw new Error("missing send button");
    }
    await act(async () => {
      send.click();
    });
    const avatars = [
      view.container.querySelector(".chat-row-agent .chat-avatar"),
      view.container.querySelector(".chat-row-user .chat-avatar"),
    ];
    for (const avatar of avatars) {
      if (!(avatar instanceof HTMLElement)) {
        throw new Error("missing message avatar");
      }
      const image = avatar.querySelector("img");
      if (!(image instanceof HTMLImageElement)) {
        throw new Error("missing avatar photo");
      }
      expect(image.alt).toBe("");
      const frame = getComputedStyle(avatar);
      const photo = getComputedStyle(image);
      expect(photo.objectFit).toBe("cover");
      expect(photo.borderRadius).toBe(designTokens.radius.sm);
      expect(frame.boxSizing).toBe("border-box");
      expect(frame.width).toBe("32px");
      expect(frame.height).toBe("32px");
      expect(filledImageBox(frame, photo)).toEqual({
        width: side(frame.width),
        height: side(frame.height),
      });
      expect(clear(frame.backgroundColor)).toBe(true);
    }
  } finally {
    style.remove();
    document.documentElement.removeAttribute("style");
  }
});

it("shows the composer disclaimer as one line with no digits", async () => {
  const view = await mount();
  const disclaimer = view.container.querySelector(".chat-disclaimer");
  if (!(disclaimer instanceof HTMLElement)) {
    throw new Error("missing disclaimer");
  }
  expect(disclaimer.textContent).toBe(
    "Steve n’est pas médecin et ne pose pas de diagnostic.",
  );
  expect(disclaimer.textContent).not.toMatch(/\d/);
});

it("shows the suggestion and the reply after a chip tap", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        reply: "Je peux vous aider à préparer ça.",
        mocked: true,
        model: "mock",
      }),
    ),
  );
  const view = await mount();
  await openConversation(view);

  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Bonjour",
  );
  expect(view.container.querySelector('[aria-label="Steve écrit"]')).toBeNull();
  expect(view.container.textContent).toContain("Je peux vous aider à préparer ça.");
  expect(view.container.querySelector('[aria-label="Retour"]')).not.toBeNull();
});

it("renders an assistant bubble without a model label, a speak button, or a footer", async () => {
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      cancel() {},
      getVoices() {
        return [];
      },
      speak() {},
      addEventListener() {},
      removeEventListener() {},
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        reply: "Tu peux contacter le secrétariat.",
        mocked: false,
        model: "openai/gpt-6.1-terra",
      }),
    ),
  );
  try {
    const view = await mount();
    await openConversation(view);

    const bubble = view.container.querySelector(".chat-agent");
    if (!(bubble instanceof HTMLElement)) {
      throw new Error("missing assistant bubble");
    }
    expect({
      text: bubble.textContent,
      buttons: bubble.querySelectorAll("button").length,
      footers: [...bubble.querySelectorAll("footer")].map((node) => node.innerHTML),
      children: [...bubble.children].map((child) => child.tagName),
    }).toEqual({
      text: "Tu peux contacter le secrétariat.",
      buttons: 0,
      footers: [],
      children: ["DIV"],
    });
  } finally {
    Reflect.deleteProperty(window, "speechSynthesis");
  }
});

it("shows the thread when the home leave animation never ends", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const view = await mount();
  await openConversation(view);

  expect(view.container.querySelector(".chat-hero")).not.toBeNull();
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  });

  expect(view.container.querySelector(".chat-hero")).toBeNull();
  expect(view.container.querySelector(".chat-user")?.textContent).toContain("Bonjour");
  expect(view.container.querySelector('[aria-label="Retour"]')).not.toBeNull();
});

it("drops the covering home sheet when its leave animation is cancelled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const view = await mount();
  await openConversation(view);
  const hero = view.container.querySelector(".chat-hero");
  if (!(hero instanceof HTMLElement)) {
    throw new Error("missing hero");
  }

  await act(async () => {
    hero.dispatchEvent(
      new AnimationEvent("animationcancel", {
        animationName: "chat-home-out",
        bubbles: true,
      }),
    );
  });

  expect(view.container.querySelector(".chat-hero")).toBeNull();
  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Bonjour",
  );
});

it("drops the covering home sheet when its leave animation ends", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const view = await mount();
  await openConversation(view);
  const hero = view.container.querySelector(".chat-hero");
  if (!(hero instanceof HTMLElement)) {
    throw new Error("missing hero");
  }

  await act(async () => {
    hero.dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "chat-home-out",
        bubbles: true,
      }),
    );
  });

  expect(view.container.querySelector(".chat-hero")).toBeNull();
  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Bonjour",
  );
});

it("ignores a home leave animationend that arrives after Retour", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const captured: Array<{
    node: HTMLElement;
    listener: (event: Event) => void;
  }> = [];
  const original = HTMLElement.prototype.addEventListener;
  const spy = vi
    .spyOn(HTMLElement.prototype, "addEventListener")
    .mockImplementation(function (
      this: HTMLElement,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      if (listener === null) {
        return;
      }
      if (type === "animationend" && typeof listener === "function") {
        captured.push({
          node: this,
          listener,
        });
      }
      if (options === undefined) {
        original.call(this, type, listener);
        return;
      }
      original.call(this, type, listener, options);
    });
  try {
    const view = await mount();
    await openConversation(view);
    const back = view.container.querySelector('[aria-label="Retour"]');
    if (!(back instanceof HTMLButtonElement)) {
      throw new Error("missing back");
    }
    await act(async () => {
      back.click();
    });
    const homeLeave = captured.find((item) =>
      item.node.classList.contains("chat-hero"),
    );
    if (homeLeave === undefined) {
      throw new Error("missing animationend listener");
    }
    const event = new AnimationEvent("animationend", {
      animationName: "chat-home-out",
    });
    Object.defineProperty(event, "target", {
      configurable: true,
      value: homeLeave.node,
    });
    await act(async () => {
      homeLeave.listener.call(homeLeave.node, event);
    });
    expect(view.container.querySelector(".chat-greeting")).toBeNull();
    expect(view.container.querySelector(".chat-hero")).not.toBeNull();
    expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
      "Bonjour",
    );
    expect(view.container.querySelector(".chat-column-leave")).not.toBeNull();
  } finally {
    spy.mockRestore();
  }
});

it("reverses the home open motion for the column exit", () => {
  expect(chatCss).toContain(
    "animation: chat-column-out var(--motion-scene) var(--motion-ease) both;",
  );
  expect(chatCss).toContain("transform: translateY(var(--motion-shift));");
  expect(chatCss).toContain(
    "transform: translateY(calc(-1 * var(--motion-shift)));",
  );
});

it("sends the home draft when Enter is pressed", async () => {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      reply: "D'accord.",
      mocked: false,
      model: "mock",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = await mount();
  const field = composerField(view.container);

  await act(async () => {
    setField(field, "Bonjour");
  });
  await act(async () => {
    pressEnter(field);
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Bonjour",
  );
});

it("adds the exit state on Retour and resets to the empty home when that animation ends", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const back = await openConversation(view);
  const field = composerField(view.container);
  await act(async () => {
    setField(field, "brouillon");
  });

  await act(async () => {
    back.click();
  });

  const column = columnOf(view.container);
  expect(column.classList.contains("chat-column-leave")).toBe(true);
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Bonjour",
  );
  expect(field.value).toBe("brouillon");
  expectNoHistoryChange();

  await act(async () => {
    endColumnExit(column);
  });

  expectEmptyHome(view.container);
  expectNoHistoryChange();
});

it("resets to the empty home when the exit animation never ends", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const back = await openConversation(view);

  await act(async () => {
    back.click();
  });

  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expectNoHistoryChange();
  await act(async () => {
    vi.advanceTimersByTime(239);
  });
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Bonjour",
  );
  expectNoHistoryChange();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  expectEmptyHome(view.container);
  expectNoHistoryChange();

  await act(async () => {
    endColumnExit(columnOf(view.container));
  });
  expectEmptyHome(view.container);
  expectNoHistoryChange();
});

it("resets to the empty home immediately when motion is reduced", async () => {
  stubReducedMotion();
  stubReply();
  const view = await mount();
  const back = await openConversation(view);

  await act(async () => {
    back.click();
    back.click();
  });

  expectEmptyHome(view.container);
  expectNoHistoryChange();
});

it("resets to the empty home once when Retour is tapped twice", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const back = await openConversation(view);

  await act(async () => {
    back.click();
    back.click();
  });

  const column = columnOf(view.container);
  expect(column.classList.contains("chat-column-leave")).toBe(true);
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  await act(async () => {
    endColumnExit(column);
    endColumnExit(column);
    vi.advanceTimersByTime(240);
  });
  expectEmptyHome(view.container);
  expectNoHistoryChange();
});

it("ignores a child animationend while the column exit plays", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const back = await openConversation(view);

  await act(async () => {
    back.click();
  });

  const column = columnOf(view.container);
  const thread = view.container.querySelector(".chat-thread");
  if (!(thread instanceof HTMLElement)) {
    throw new Error("missing thread");
  }

  await act(async () => {
    thread.dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "chat-enter-fade",
        bubbles: true,
      }),
    );
    thread.dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "chat-column-out",
        bubbles: true,
      }),
    );
    column.dispatchEvent(
      new AnimationEvent("animationend", {
        animationName: "chat-enter-fade",
        bubbles: true,
      }),
    );
  });

  expect(column.classList.contains("chat-column-leave")).toBe(true);
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expect(thread.textContent).toContain("Bonjour");
  expectNoHistoryChange();

  await act(async () => {
    endColumnExit(column);
  });

  expectEmptyHome(view.container);
  expectNoHistoryChange();
});

it("does not send when Enter is pressed during the column exit", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      reply: "D'accord.",
      mocked: false,
      model: "mock",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = await mount();
  const back = await openConversation(view);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    vi.advanceTimersByTime(700);
  });
  await act(async () => {
    vi.advanceTimersByTime(1400);
  });
  const field = composerField(view.container);

  await act(async () => {
    setField(field, "Pharmacie de garde");
  });
  await act(async () => {
    back.click();
  });
  await act(async () => {
    pressEnter(field);
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(view.container.querySelectorAll(".chat-user")).toHaveLength(1);
  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );
  expect(field.value).toBe("Pharmacie de garde");

  await act(async () => {
    endColumnExit(columnOf(view.container));
  });
  expectEmptyHome(view.container);

  const homeField = composerField(view.container);
  await act(async () => {
    setField(homeField, "Pharmacie de garde");
  });
  await act(async () => {
    pressEnter(homeField);
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Pharmacie de garde",
  );
  expectNoHistoryChange();
});

it("remounts the home hero when Retour finishes after the hero has left", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  await openConversation(view);
  expect(view.container.querySelector(".chat-hero")).not.toBeNull();

  await act(async () => {
    vi.advanceTimersByTime(240);
  });

  expect(view.container.querySelector(".chat-hero")).toBeNull();
  const back = view.container.querySelector('[aria-label="Retour"]');
  if (!(back instanceof HTMLButtonElement)) {
    throw new Error("missing back");
  }
  await act(async () => {
    back.click();
  });
  expect(view.container.querySelector(".chat-hero")).toBeNull();
  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );

  await act(async () => {
    endColumnExit(columnOf(view.container));
  });

  expectEmptyHome(view.container);
  expectNoHistoryChange();
});

it("does not finish a later Retour with the previous exit timeout", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const first = await openConversation(view);

  await act(async () => {
    first.click();
  });
  await act(async () => {
    endColumnExit(columnOf(view.container));
  });
  expectEmptyHome(view.container);

  await act(async () => {
    vi.advanceTimersByTime(100);
  });

  await openConversation(view);
  const second = view.container.querySelector('[aria-label="Retour"]');
  if (!(second instanceof HTMLButtonElement)) {
    throw new Error("missing back");
  }
  await act(async () => {
    second.click();
  });
  await act(async () => {
    vi.advanceTimersByTime(140);
  });

  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Bonjour",
  );
  expectNoHistoryChange();
});

it("stops dictation when Retour starts", async () => {
  installDictation();
  stubReply();
  const view = await mount();
  await openConversation(view);
  expect(dictateButton(view.container).getAttribute("aria-label")).toBe(
    "Dicter un message",
  );

  await act(async () => {
    activateDictationFromKeyboard(dictateButton(view.container));
  });
  expect(dictateButton(view.container).getAttribute("aria-label")).toBe(
    "Arrêter la dictée",
  );

  const back = view.container.querySelector('[aria-label="Retour"]');
  if (!(back instanceof HTMLButtonElement)) {
    throw new Error("missing back");
  }
  await act(async () => {
    back.click();
  });

  expect(dictateButton(view.container).getAttribute("aria-label")).toBe(
    "Dicter un message",
  );
  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );
});

it("does not start dictation from the keyboard while the column exit plays", async () => {
  installDictation();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const back = await openConversation(view);
  expect(dictateButton(view.container).getAttribute("aria-label")).toBe(
    "Dicter un message",
  );

  await act(async () => {
    back.click();
  });
  await act(async () => {
    activateDictationFromKeyboard(dictateButton(view.container));
  });

  expect(dictateButton(view.container).getAttribute("aria-label")).toBe(
    "Dicter un message",
  );
  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );

  await act(async () => {
    endColumnExit(columnOf(view.container));
  });
  expectEmptyHome(view.container);

  await act(async () => {
    activateDictationFromKeyboard(dictateButton(view.container));
  });
  expect(dictateButton(view.container).getAttribute("aria-label")).toBe(
    "Arrêter la dictée",
  );
});

it("returns home from Retour, starts another conversation, and returns home again", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const view = await mount();
  const first = await openConversation(view);
  expect(view.container.querySelector(".chat-badge")).not.toBeNull();

  await act(async () => {
    first.click();
  });
  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );

  await act(async () => {
    endColumnExit(columnOf(view.container));
  });
  expectEmptyHome(view.container);

  const pending = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => pending.promise),
  );
  await openConversation(view);

  expect(view.container.querySelector(".chat-badge")).toBeNull();
  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Bonjour",
  );
  const second = view.container.querySelector('[aria-label="Retour"]');
  if (!(second instanceof HTMLButtonElement)) {
    throw new Error("missing back");
  }

  await act(async () => {
    second.click();
  });
  expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
    true,
  );
  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Bonjour",
  );

  await act(async () => {
    endColumnExit(columnOf(view.container));
  });
  expectEmptyHome(view.container);
  expectNoHistoryChange();

  pending.resolve(
    Response.json({
      reply: "Tardive.",
      mocked: true,
      model: "mock",
    }),
  );
  await act(async () => {
    await pending.promise;
  });

  expect(view.container.textContent).not.toContain("Tardive.");
  expectEmptyHome(view.container);
});

it("keeps the keyboard pin while the column exit plays", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  stubReply();
  const viewport = installViewport({
    height: 844,
    offsetTop: 0,
    innerHeight: 844,
  });
  try {
    const view = await mount();
    await flushFrame();
    const back = await openConversation(view);
    const page = view.container.querySelector(".chat-page");
    if (!(page instanceof HTMLElement)) {
      throw new Error("missing chat page");
    }
    viewport.height = 420;
    viewport.offsetTop = 180;
    await fireViewport(viewport);
    await act(async () => {
      back.click();
    });
    viewport.height = 400;
    viewport.offsetTop = 200;
    await fireViewport(viewport);
    expect(columnOf(view.container).classList.contains("chat-column-leave")).toBe(
      true,
    );
    expect({
      top: page.style.top,
      height: page.style.height,
      transform: page.style.transform,
      keyboard: page.hasAttribute("data-keyboard-open"),
    }).toEqual({
      top: "200px",
      height: "400px",
      transform: "",
      keyboard: true,
    });
    expect(view.container.querySelector(".chat-greeting")).toBeNull();
    expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
      "Bonjour",
    );
    expectNoHistoryChange();
  } finally {
    viewport.restore();
  }
});

it("pins the chat page to the visual viewport when the keyboard resizes it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        reply: "Je peux vous aider à préparer ça.",
        mocked: true,
        model: "mock",
      }),
    ),
  );
  const listeners = new Map<string, EventListener[]>();
  const viewport = {
    height: 844,
    offsetTop: 0,
    scale: 1,
    addEventListener(type: string, listener: EventListener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    removeEventListener(type: string, listener: EventListener) {
      const current = listeners.get(type) ?? [];
      listeners.set(
        type,
        current.filter((item) => item !== listener),
      );
    },
  };
  const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const previousInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 844,
  });
  const style = document.createElement("style");
  style.textContent = chatCss;
  document.head.append(style);
  try {
    const view = await mount();
    await flushFrame();
    const field = view.container.querySelector(".chat-field");
    if (!(field instanceof HTMLTextAreaElement)) {
      throw new Error("missing composer");
    }
    await act(async () => {
      setField(field, "Bonjour");
    });
    const send = view.container.querySelector('button[aria-label="Envoyer"]');
    if (!(send instanceof HTMLButtonElement)) {
      throw new Error("missing send button");
    }
    await act(async () => send.click());
    const page = view.container.querySelector(".chat-page");
    const thread = view.container.querySelector(".chat-scroll");
    const disclaimer = view.container.querySelector(
      ".chat-column > .chat-dock .chat-disclaimer",
    );
    if (
      !(page instanceof HTMLElement) ||
      !(thread instanceof HTMLElement) ||
      !(disclaimer instanceof HTMLElement)
    ) {
      throw new Error("missing chat shell");
    }
    const scrolled = trackScroll(thread, threadLength);
    scrolled.top = 0;
    viewport.height = 420;
    viewport.offsetTop = 180;
    page.style.transform = "translateY(12px)";
    await act(async () => {
      for (const listener of listeners.get("resize") ?? []) {
        listener(new Event("resize"));
      }
      for (const listener of listeners.get("scroll") ?? []) {
        listener(new Event("scroll"));
      }
    });
    await flushFrame();
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect({
      top: page.style.top,
      height: page.style.height,
      transform: page.style.transform,
      position: getComputedStyle(page).position,
      disclaimer: getComputedStyle(disclaimer).display,
      scrollTop: scrolled.top,
      overflow: document.documentElement.style.overflow,
      overscroll: document.documentElement.style.overscrollBehavior,
    }).toEqual({
      top: "180px",
      height: "420px",
      transform: "",
      position: "fixed",
      disclaimer: "none",
      scrollTop: thread.scrollHeight - thread.clientHeight,
      overflow: "hidden",
      overscroll: "none",
    });
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(window, "visualViewport");
    } else {
      Object.defineProperty(window, "visualViewport", previous);
    }
    if (previousInnerHeight === undefined) {
      Reflect.deleteProperty(window, "innerHeight");
    } else {
      Object.defineProperty(window, "innerHeight", previousInnerHeight);
    }
    style.remove();
  }
});

it("does not jump to the latest message when the viewport resizes while older messages are on screen", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    scrolled.top = 0;
    viewport.setInnerHeight(700);
    viewport.height = 690;
    viewport.offsetTop = 24;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("keeps the latest reply visible when the viewport resizes at the bottom of the thread", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, thread, scrolled } = await scrolledThread();
    scrolled.top = threadLength - thread.clientHeight;
    viewport.setInnerHeight(700);
    viewport.height = 690;
    viewport.offsetTop = 12;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(thread.scrollHeight - thread.clientHeight);
  } finally {
    viewport.restore();
  }
});

it("keeps the latest reply visible when the keyboard opens at the bottom of the thread", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, thread, scrolled } = await scrolledThread();
    scrolled.top = threadLength - thread.clientHeight;
    viewport.height = 420;
    viewport.offsetTop = 180;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(thread.scrollHeight - thread.clientHeight);
  } finally {
    viewport.restore();
  }
});

it("does not jump to the latest message when the keyboard closes over older messages", async () => {
  stubReply();
  const viewport = installViewport({ height: 420, offsetTop: 180, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    scrolled.top = 0;
    viewport.height = 844;
    viewport.offsetTop = 0;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("does not open the keyboard or scroll when a pinch zoom shortens the visual viewport", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    scrolled.top = 0;
    viewport.scale = 1.2;
    viewport.height = 700;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("does not scroll when the keyboard stays open over older messages", async () => {
  stubReply();
  const viewport = installViewport({ height: 420, offsetTop: 180, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    scrolled.top = 0;
    viewport.height = 380;
    viewport.offsetTop = 200;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("keeps a mid-thread reader in place when zoom returns to 1x with the keyboard still open", async () => {
  stubReply();
  const viewport = installViewport({ height: 420, offsetTop: 180, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    scrolled.top = 0;
    viewport.scale = 1.2;
    viewport.height = 350;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.scale = 1;
    viewport.height = 420;
    viewport.offsetTop = 180;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("does not scroll a mid-thread reader when the keyboard closes while zoomed and the user zooms out", async () => {
  stubReply();
  const viewport = installViewport({ height: 420, offsetTop: 180, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    scrolled.top = 0;
    viewport.scale = 1.2;
    viewport.height = 350;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.height = 700;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.scale = 1;
    viewport.height = 844;
    viewport.offsetTop = 0;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("does not scroll a mid-thread reader when the keyboard opens while zoomed and the user zooms out", async () => {
  stubReply();
  const viewport = installViewport({
    height: 700,
    offsetTop: 0,
    innerHeight: 844,
    scale: 1.2,
  });
  try {
    const { page, scrolled } = await scrolledThread();
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    scrolled.top = 0;
    viewport.height = 350;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.scale = 1;
    viewport.height = 420;
    viewport.offsetTop = 180;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(0);
  } finally {
    viewport.restore();
  }
});

it("scrolls a mid-thread reader when a pinch with no keyboard is followed by the keyboard at 1x", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, thread, scrolled } = await scrolledThread();
    scrolled.top = 0;
    viewport.scale = 1.2;
    viewport.height = 700;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.scale = 1;
    viewport.height = 420;
    viewport.offsetTop = 180;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(thread.scrollHeight - thread.clientHeight);
  } finally {
    viewport.restore();
  }
});

it("scrolls a reader within 80px of the bottom and leaves a reader past that gap", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, thread, scrolled } = await scrolledThread();
    const client = thread.clientHeight;
    scrolled.top = threadLength - client - 80;
    viewport.offsetTop = 16;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(thread.scrollHeight - thread.clientHeight);
    scrolled.top = threadLength - client - 81;
    viewport.offsetTop = 32;
    await fireViewport(viewport);
    expect(scrolled.top).toBe(threadLength - client - 81);
  } finally {
    viewport.restore();
  }
});

it("leaves the keyboard closed at a 120px gap and opens it at 121px", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, thread, scrolled } = await scrolledThread();
    scrolled.top = 0;
    viewport.height = 724;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.height = 723;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(thread.scrollHeight - thread.clientHeight);
  } finally {
    viewport.restore();
  }
});

it("does not scroll at scale 1.01 and scrolls at scale 1.0099 when the keyboard is open", async () => {
  stubReply();
  const viewport = installViewport({ height: 1000, offsetTop: 0, innerHeight: 1000 });
  try {
    const { page, thread, scrolled } = await scrolledThread();
    scrolled.top = 0;
    viewport.scale = 1.01;
    viewport.height = 800;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.scale = 1;
    viewport.height = 1000;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(0);
    viewport.scale = 1.0099;
    viewport.height = 800;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(thread.scrollHeight - thread.clientHeight);
  } finally {
    viewport.restore();
  }
});

it("restores page scroll when the chat unmounts", async () => {
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  const html = document.documentElement;
  const body = document.body;
  const previous = {
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyOverscroll: body.style.overscrollBehavior,
  };
  html.style.overflow = "visible";
  body.style.overflow = "scroll";
  html.style.overscrollBehavior = "auto";
  body.style.overscrollBehavior = "contain";
  try {
    const view = await mount();
    await flushFrame();
    expect(html.style.overflow).toBe("hidden");
    expect(body.style.overflow).toBe("hidden");
    expect(html.style.overscrollBehavior).toBe("none");
    expect(body.style.overscrollBehavior).toBe("none");
    await unmount(view);
    expect(html.style.overflow).toBe("visible");
    expect(body.style.overflow).toBe("scroll");
    expect(html.style.overscrollBehavior).toBe("auto");
    expect(body.style.overscrollBehavior).toBe("contain");
  } finally {
    viewport.restore();
    html.style.overflow = previous.htmlOverflow;
    body.style.overflow = previous.bodyOverflow;
    html.style.overscrollBehavior = previous.htmlOverscroll;
    body.style.overscrollBehavior = previous.bodyOverscroll;
  }
});

it("stops following the visual viewport after the chat unmounts", async () => {
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const view = await mount();
    await flushFrame();
    const page = view.container.querySelector(".chat-page");
    if (!(page instanceof HTMLElement)) {
      throw new Error("missing chat page");
    }
    await unmount(view);
    expect(page.style.height).toBe("");
    viewport.height = 320;
    viewport.offsetTop = 40;
    await fireViewport(viewport);
    expect(page.style.top).toBe("");
    expect(page.style.height).toBe("");
  } finally {
    viewport.restore();
  }
});

it("drops a late reply after Retour and returns to the empty home", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const reply = deferred<Response>();
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementationOnce(() => reply.promise);
  fetchMock.mockImplementation(async () =>
    Response.json({
      reply: "Deuxième.",
      mocked: false,
      model: "mock",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = await mount();
  const header = () => view.container.querySelector(".chat-header");
  await openConversation(view);

  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Bonjour",
  );
  const back = header()?.querySelector('[aria-label="Retour"]');
  expect(back).not.toBeNull();
  expect(view.container.querySelector(".chat-greeting")).toBeNull();

  await act(async () => {
    back?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(view.container.querySelector(".chat-greeting")).toBeNull();
  expect(view.container.querySelector(".chat-column-leave")).not.toBeNull();
  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Bonjour",
  );
  expectNoHistoryChange();

  await act(async () => {
    vi.advanceTimersByTime(240);
  });

  expectEmptyHome(view.container);
  expectNoHistoryChange();

  reply.resolve(
    new Response(
      JSON.stringify({
        reply: "Réponse tardive.",
        mocked: true,
        model: "mock",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  await act(async () => {
    await reply.promise;
  });

  expect(view.container.textContent).not.toContain("Réponse tardive.");
  expectEmptyHome(view.container);

  await openConversation(view);

  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Bonjour",
  );
  expect(view.container.textContent).toContain("Deuxième.");
  expect(view.container.textContent).not.toContain("Réponse tardive.");
  expect(view.container.querySelector(".chat-badge")).toBeNull();
  expectNoHistoryChange();
});

it("keeps the scroll position and shows a new-message pill when a reply arrives above the bottom", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    const pill = newMessagePill(session.container);
    const dock = session.container.querySelector(".chat-column > .chat-dock");
    expect(dock instanceof HTMLElement).toBe(true);
    expect({
      text: pill?.textContent ?? null,
      label: pill?.getAttribute("aria-label") ?? null,
      type: pill?.getAttribute("type") ?? null,
      live: pill?.closest("[aria-live]")?.getAttribute("aria-live") ?? null,
      arrow: pill?.querySelector("[aria-hidden='true']")?.textContent ?? null,
      threadLive:
        session.container.querySelector(".chat-thread")?.getAttribute("aria-live") ??
        null,
      scrollTop: session.scrolled.top,
      insideThread: pill === null ? null : session.thread.contains(pill),
      afterThread:
        pill === null
          ? null
          : (session.thread.compareDocumentPosition(pill) &
              Node.DOCUMENT_POSITION_FOLLOWING) ===
            Node.DOCUMENT_POSITION_FOLLOWING,
      beforeDock:
        pill === null || !(dock instanceof HTMLElement)
          ? null
          : (pill.compareDocumentPosition(dock) &
              Node.DOCUMENT_POSITION_FOLLOWING) ===
            Node.DOCUMENT_POSITION_FOLLOWING,
    }).toEqual({
      text: "Nouveau message↓",
      label: "Nouveau message",
      type: "button",
      live: null,
      arrow: "↓",
      threadLive: "polite",
      scrollTop: 0,
      insideThread: false,
      afterThread: true,
      beforeDock: true,
    });
  } finally {
    session.restore();
  }
});

it("scrolls smoothly to the bottom and hides the pill when the new-message pill is tapped", async () => {
  const session = await pendingThread();
  const requested: ScrollToOptions[] = [];
  function scrollTo(options?: ScrollToOptions): void;
  function scrollTo(x: number, y: number): void;
  function scrollTo(options?: ScrollToOptions | number, _y?: number): void {
    if (typeof options === "object" && options !== null) {
      requested.push(options);
    }
  }
  session.thread.scrollTo = scrollTo;
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    const pill = newMessagePill(session.container);
    if (!(pill instanceof HTMLButtonElement)) {
      throw new Error("missing new-message pill");
    }
    const newest = newestReply(session.container);
    await act(async () => {
      pill.click();
    });
    expect(requested).toEqual([
      { top: session.thread.scrollHeight, behavior: "smooth" },
    ]);
    expect(session.scrolled.top).toBe(0);
    expect(newMessagePill(session.container)).toBeNull();
    expect(document.activeElement).toBe(newest);
    expect(newest.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).not.toBe(
      session.container.querySelector("textarea"),
    );
  } finally {
    session.restore();
  }
});

it("hides the new-message pill when the reader scrolls back to the bottom", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    expect(newMessagePill(session.container)).not.toBeNull();
    await act(async () => {
      session.scrolled.top = session.thread.scrollHeight - session.thread.clientHeight;
      session.thread.dispatchEvent(new Event("scroll"));
    });
    const gap =
      session.thread.scrollHeight - session.scrolled.top - session.thread.clientHeight;
    expect(gap).toBeLessThanOrEqual(0);
    expect(newMessagePill(session.container)).toBeNull();
  } finally {
    session.restore();
  }
});

it("follows a taller reply without a pill when the reader is already near the bottom", async () => {
  const session = await pendingThread();
  try {
    Object.defineProperty(session.thread, "scrollHeight", {
      configurable: true,
      get: () =>
        threadLength + session.thread.querySelectorAll(".chat-agent").length * 400,
    });
    session.scrolled.top = session.thread.scrollHeight - session.thread.clientHeight;
    session.thread.dispatchEvent(new Event("scroll"));
    const topBeforeReply = session.scrolled.top;
    await session.release("Voici la suite.");
    expect(session.container.textContent).toContain("Voici la suite.");
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(
      session.thread.scrollHeight - session.thread.clientHeight,
    );
    expect(session.scrolled.top).toBeGreaterThan(topBeforeReply);
  } finally {
    session.restore();
  }
});

it("scrolls instantly when the new-message pill is tapped with reduced motion", async () => {
  const session = await pendingThread();
  const motions: Array<ScrollBehavior | undefined> = [];
  const restoreMotion = stubReducedMotion(true);
  function scrollTo(options?: ScrollToOptions): void;
  function scrollTo(x: number, y: number): void;
  function scrollTo(options?: ScrollToOptions | number, y?: number): void {
    const behavior =
      typeof options === "object" && options !== null ? options.behavior : "auto";
    motions.push(behavior);
    if (behavior === "smooth") {
      return;
    }
    const top =
      typeof options === "object" && options !== null ? (options.top ?? 0) : (y ?? 0);
    session.scrolled.top = top;
    session.thread.dispatchEvent(new Event("scroll"));
  }
  session.thread.scrollTo = scrollTo;
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    const pill = newMessagePill(session.container);
    if (!(pill instanceof HTMLButtonElement)) {
      throw new Error("missing new-message pill");
    }
    const newest = newestReply(session.container);
    await act(async () => {
      pill.click();
    });
    expect(motions).not.toContain("smooth");
    expect(session.scrolled.top).toBe(
      session.thread.scrollHeight - session.thread.clientHeight,
    );
    expect(newMessagePill(session.container)).toBeNull();
    expect(document.activeElement).toBe(newest);
    expect(newest.getAttribute("tabindex")).toBe("-1");
  } finally {
    restoreMotion();
    session.restore();
  }
});

it("follows an in-flight reply when the keyboard opens without a further scroll", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    session.viewport.height = 420;
    session.viewport.offsetTop = 180;
    await fireViewport(session.viewport);
    expect(session.scrolled.top).toBe(
      session.thread.scrollHeight - session.thread.clientHeight,
    );
    await session.release("Voici la suite.");
    expect(session.container.textContent).toContain("Voici la suite.");
    expect(newMessagePill(session.container)).toBeNull();
  } finally {
    session.restore();
  }
});

it("hides a visible pill when the keyboard opens over an unread reply", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    expect(newMessagePill(session.container)).not.toBeNull();
    expect(session.scrolled.top).toBe(0);
    session.viewport.height = 420;
    session.viewport.offsetTop = 180;
    await fireViewport(session.viewport);
    const page = session.container.querySelector(".chat-page");
    if (!(page instanceof HTMLElement)) {
      throw new Error("missing chat page");
    }
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(
      session.thread.scrollHeight - session.thread.clientHeight,
    );
  } finally {
    session.restore();
  }
});

it("follows the next reply when a keyboard close lands inside 80px without scrolling", async () => {
  const session = await pendingThread();
  try {
    session.viewport.height = 420;
    session.viewport.offsetTop = 180;
    await fireViewport(session.viewport);
    const closedHeight = 844;
    const parked = threadLength - closedHeight - 40;
    session.scrolled.top = parked;
    session.thread.dispatchEvent(new Event("scroll"));
    session.viewport.height = closedHeight;
    session.viewport.offsetTop = 0;
    await fireViewport(session.viewport);
    const gap =
      session.thread.scrollHeight - session.thread.scrollTop - session.thread.clientHeight;
    expect(gap).toBe(40);
    expect(session.scrolled.top).toBe(parked);
    await session.release("Voici la suite.");
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(
      session.thread.scrollHeight - session.thread.clientHeight,
    );
  } finally {
    session.restore();
  }
});

it("hides the pill when a keyboard close re-pins a reader 480px up", async () => {
  const session = await pendingThread();
  try {
    session.viewport.height = 420;
    session.viewport.offsetTop = 180;
    await fireViewport(session.viewport);
    const parked = threadLength - session.thread.clientHeight - 480;
    session.scrolled.top = parked;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    expect(newMessagePill(session.container)).not.toBeNull();
    session.viewport.height = 844;
    session.viewport.offsetTop = 0;
    await fireViewport(session.viewport);
    const gap =
      session.thread.scrollHeight - session.thread.scrollTop - session.thread.clientHeight;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(80);
    expect(session.scrolled.top).toBe(parked);
    expect(newMessagePill(session.container)).toBeNull();
  } finally {
    session.restore();
  }
});

it("still shows the pill when a viewport resize leaves the reader outside 80px", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    session.viewport.offsetTop = 12;
    await fireViewport(session.viewport);
    await session.release("Voici la suite.");
    expect(session.scrolled.top).toBe(0);
    expect(newMessagePill(session.container)).not.toBeNull();
  } finally {
    session.restore();
  }
});

it("hides the pill inside the 80px band without moving the thread", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    const parked = threadLength - session.thread.clientHeight - 40;
    await act(async () => {
      session.scrolled.top = parked;
      session.thread.dispatchEvent(new Event("scroll"));
    });
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(parked);
  } finally {
    session.restore();
  }
});

it("follows the thread and hides the pill when you send while scrolled up", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    expect(newMessagePill(session.container)).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    await sendComposer(session.container, "Encore");
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(
      session.thread.scrollHeight - session.thread.clientHeight,
    );
    expect(session.container.textContent).toContain("Encore");
  } finally {
    session.restore();
  }
});

it("shows the pill when an error reply arrives above the bottom", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 0;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Le service est indisponible.", "error");
    expect(session.scrolled.top).toBe(0);
    expect(session.container.querySelector(".chat-error")?.textContent).toBe(
      "Le service est indisponible.",
    );
    expect(newMessagePill(session.container)?.textContent).toBe(
      "Nouveau message↓",
    );
  } finally {
    session.restore();
  }
});

it("returns to the top of home with no pill after Retour from an unread reply", async () => {
  const session = await pendingThread();
  try {
    session.scrolled.top = 400;
    session.thread.dispatchEvent(new Event("scroll"));
    await session.release("Voici la suite.");
    expect(newMessagePill(session.container)).not.toBeNull();
    const back = session.container.querySelector('[aria-label="Retour"]');
    if (!(back instanceof HTMLButtonElement)) {
      throw new Error("missing back");
    }
    await act(async () => {
      back.click();
    });
    expect(session.container.querySelector(".chat-column-leave")).not.toBeNull();
    expect(session.container.querySelector(".chat-greeting")).toBeNull();
    expect(session.container.querySelector(".chat-thread")?.textContent).toContain(
      "Voici la suite.",
    );
    expect(session.scrolled.top).toBe(400);
    expect(newMessagePill(session.container)).toBeNull();
    await act(async () => {
      endColumnExit(columnOf(session.container));
    });
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(0);
    expect(session.container.querySelector(".chat-greeting")?.textContent).toBe(
      "Bonjour",
    );
    expectNoHistoryChange();

    const restoreMotion = stubReducedMotion(true);
    try {
      const field = session.container.querySelector(".chat-field");
      if (!(field instanceof HTMLTextAreaElement)) {
        throw new Error("missing composer");
      }
      await act(async () => setField(field, "Bonjour encore"));
      const send = session.container.querySelector('button[aria-label="Envoyer"]');
      if (!(send instanceof HTMLButtonElement)) throw new Error("missing send button");
      await act(async () => send.click());
      session.scrolled.top = 400;
      session.thread.dispatchEvent(new Event("scroll"));
      await session.release("Encore.");
      expect(newMessagePill(session.container)).not.toBeNull();
      const again = session.container.querySelector('[aria-label="Retour"]');
      if (!(again instanceof HTMLButtonElement)) {
        throw new Error("missing back");
      }
      await act(async () => {
        again.click();
      });
      expect(newMessagePill(session.container)).toBeNull();
      expect(session.scrolled.top).toBe(0);
      expect(session.container.querySelector(".chat-greeting")?.textContent).toBe(
        "Bonjour",
      );
      expectNoHistoryChange();
    } finally {
      restoreMotion();
    }
  } finally {
    session.restore();
  }
});

const threadLength = 2000;

function stubReducedMotion(matches = true): () => void {
  const original = window.matchMedia.bind(window);
  const spy = vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const list = original(query);
    Object.defineProperty(list, "matches", {
      configurable: true,
      get() {
        return matches && query === "(prefers-reduced-motion: reduce)";
      },
    });
    return list;
  });
  return () => {
    spy.mockRestore();
  };
}

async function openConversation(view: {
  container: ParentNode;
}): Promise<HTMLButtonElement> {
  const field = view.container.querySelector(".chat-field");
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("missing composer");
  }
  await act(async () => {
    setField(field, "Bonjour");
  });
  const send = view.container.querySelector('button[aria-label="Envoyer"]');
  if (!(send instanceof HTMLButtonElement)) {
    throw new Error("missing send button");
  }
  await act(async () => {
    send.click();
  });
  const back = view.container.querySelector('[aria-label="Retour"]');
  if (!(back instanceof HTMLButtonElement)) {
    throw new Error("missing back");
  }
  return back;
}

function expectNoHistoryChange(): void {
  expect(vi.mocked(history.pushState)).not.toHaveBeenCalled();
  expect(vi.mocked(history.replaceState)).not.toHaveBeenCalled();
}

function expectEmptyHome(container: ParentNode): void {
  const hero = container.querySelector(".chat-hero");
  const field = container.querySelector(".chat-field");
  const column = container.querySelector(".chat-column");
  expect({
    greeting: container.querySelector(".chat-greeting")?.textContent ?? null,
    back: container.querySelector('[aria-label="Retour"]'),
    thread: container.querySelector(".chat-thread"),
    hero: hero instanceof HTMLElement && !hero.classList.contains("chat-hero-leave"),
    mascot: container.querySelector(".chat-hero-mascot") instanceof HTMLElement,
    draft: field instanceof HTMLTextAreaElement ? field.value : null,
    callCta: container.querySelector(".chat-call-cta") instanceof HTMLElement,
    leaving: column?.classList.contains("chat-column-leave") ?? null,
    profile:
      container.querySelector('.chat-header [aria-label="Profil"]') instanceof
      HTMLElement,
    badge: container.querySelector(".chat-badge"),
  }).toEqual({
    greeting: "Bonjour",
    back: null,
    thread: null,
    hero: true,
    mascot: true,
    draft: "",
    callCta: true,
    leaving: false,
    profile: false,
    badge: null,
  });
}

function composerField(container: ParentNode): HTMLTextAreaElement {
  const field = container.querySelector(".chat-field");
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("missing composer");
  }
  return field;
}

function setField(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(field, value);
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function installDictation(): void {
  class FakeRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
    onend: (() => void) | null = null;
    started = false;
    stopped = false;
    start(): void {
      this.started = true;
    }
    stop(): void {
      this.stopped = true;
      this.onend?.();
    }
    abort(): void {
      this.stopped = true;
    }
  }
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  vi.stubGlobal("isSecureContext", true);
}

function dictateButton(container: ParentNode): HTMLButtonElement {
  const button = container.querySelector(
    '[aria-label="Dicter un message"], [aria-label="Arrêter la dictée"]',
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("missing dictation");
  }
  return button;
}

function activateDictationFromKeyboard(button: HTMLButtonElement): void {
  button.focus();
  const keydown = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  button.dispatchEvent(keydown);
  if (keydown.defaultPrevented) {
    return;
  }
  button.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 0,
    }),
  );
}

function pressEnter(field: HTMLTextAreaElement): void {
  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  );
}

function columnOf(container: ParentNode): HTMLElement {
  const column = container.querySelector(".chat-column");
  if (!(column instanceof HTMLElement)) {
    throw new Error("missing column");
  }
  return column;
}

function endColumnExit(column: HTMLElement): void {
  column.dispatchEvent(
    new AnimationEvent("animationend", {
      animationName: "chat-column-out",
      bubbles: true,
    }),
  );
}

function stubReply(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        reply: "Je peux vous aider à préparer ça.",
        mocked: true,
        model: "mock",
      }),
    ),
  );
}

type ViewportStub = {
  height: number;
  offsetTop: number;
  scale: number;
  setInnerHeight(value: number): void;
  fire(type: string): void;
  restore(): void;
};

function installViewport(initial: {
  height: number;
  offsetTop: number;
  innerHeight: number;
  scale?: number;
}): ViewportStub {
  const listeners = new Map<string, EventListener[]>();
  const viewport = {
    height: initial.height,
    offsetTop: initial.offsetTop,
    scale: initial.scale ?? 1,
    addEventListener(type: string, listener: EventListener) {
      const current = listeners.get(type) ?? [];
      current.push(listener);
      listeners.set(type, current);
    },
    removeEventListener(type: string, listener: EventListener) {
      const current = listeners.get(type) ?? [];
      listeners.set(
        type,
        current.filter((item) => item !== listener),
      );
    },
  };
  let innerHeight = initial.innerHeight;
  const previousViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const previousInnerHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => innerHeight,
  });
  return {
    get height() {
      return viewport.height;
    },
    set height(value: number) {
      viewport.height = value;
    },
    get offsetTop() {
      return viewport.offsetTop;
    },
    set offsetTop(value: number) {
      viewport.offsetTop = value;
    },
    get scale() {
      return viewport.scale;
    },
    set scale(value: number) {
      viewport.scale = value;
    },
    setInnerHeight(value: number) {
      innerHeight = value;
    },
    fire(type: string) {
      const event = new Event(type);
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(event);
      }
    },
    restore() {
      if (previousViewport === undefined) {
        Reflect.deleteProperty(window, "visualViewport");
      } else {
        Object.defineProperty(window, "visualViewport", previousViewport);
      }
      if (previousInnerHeight === undefined) {
        Reflect.deleteProperty(window, "innerHeight");
      } else {
        Object.defineProperty(window, "innerHeight", previousInnerHeight);
      }
    },
  };
}

async function fireViewport(viewport: ViewportStub): Promise<void> {
  await act(async () => {
    viewport.fire("resize");
    viewport.fire("scroll");
  });
  await flushFrame();
}

async function scrolledThread(): Promise<{
  page: HTMLElement;
  thread: HTMLElement;
  scrolled: { top: number };
}> {
  const view = await mount();
  await flushFrame();
  const field = view.container.querySelector(".chat-field");
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("missing composer");
  }
  await act(async () => {
    setField(field, "Bonjour");
  });
  const send = view.container.querySelector('button[aria-label="Envoyer"]');
  if (!(send instanceof HTMLButtonElement)) {
    throw new Error("missing send button");
  }
  await act(async () => send.click());
  const page = view.container.querySelector(".chat-page");
  const thread = view.container.querySelector(".chat-scroll");
  if (!(page instanceof HTMLElement) || !(thread instanceof HTMLElement)) {
    throw new Error("missing chat shell");
  }
  return { page, thread, scrolled: trackScroll(thread, threadLength) };
}

async function unmount(view: { root: Root }): Promise<void> {
  const index = roots.indexOf(view.root);
  if (index >= 0) {
    roots.splice(index, 1);
  }
  await act(async () => {
    view.root.unmount();
  });
}

function newMessagePill(container: ParentNode): HTMLButtonElement | null {
  const pill = container.querySelector('button[aria-label="Nouveau message"]');
  return pill instanceof HTMLButtonElement ? pill : null;
}

function deferFetch(): {
  fetch: typeof fetch;
  resolve: (response: Response) => void;
} {
  let resolve: (response: Response) => void = () => {
    throw new Error("reply released before the request");
  };
  const fetchMock: typeof fetch = () =>
    new Promise((done) => {
      resolve = done;
    });
  return {
    fetch: fetchMock,
    resolve(response: Response) {
      resolve(response);
    },
  };
}

async function pendingThread(): Promise<{
  container: HTMLDivElement;
  thread: HTMLElement;
  scrolled: { top: number };
  viewport: ViewportStub;
  release: (reply: string, kind?: "agent" | "error") => Promise<void>;
  restore: () => void;
}> {
  const pending = deferFetch();
  vi.stubGlobal("fetch", pending.fetch);
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const view = await mount();
    await flushFrame();
    const field = view.container.querySelector(".chat-field");
    if (!(field instanceof HTMLTextAreaElement)) {
      throw new Error("missing composer");
    }
    await act(async () => {
      setField(field, "Bonjour");
    });
    const send = view.container.querySelector('button[aria-label="Envoyer"]');
    if (!(send instanceof HTMLButtonElement)) {
      throw new Error("missing send button");
    }
    await act(async () => send.click());
    const thread = view.container.querySelector(".chat-scroll");
    if (!(thread instanceof HTMLElement)) {
      throw new Error("missing thread");
    }
    return {
      container: view.container,
      thread,
      scrolled: trackScroll(thread, threadLength),
      viewport,
      release: async (reply: string, kind: "agent" | "error" = "agent") => {
        await act(async () => {
          if (kind === "error") {
            pending.resolve(
              new Response(JSON.stringify({ error: reply }), {
                status: 500,
                headers: { "content-type": "application/json" },
              }),
            );
            return;
          }
          pending.resolve(Response.json({ reply, mocked: true, model: "mock" }));
        });
      },
      restore: () => {
        viewport.restore();
      },
    };
  } catch (error) {
    viewport.restore();
    throw error;
  }
}

function newestReply(container: ParentNode): HTMLElement {
  const newest = container.querySelector(".chat-thread > li:last-child");
  if (!(newest instanceof HTMLElement)) {
    throw new Error("missing newest reply");
  }
  return newest;
}

async function sendComposer(container: ParentNode, text: string): Promise<void> {
  const field = container.querySelector("textarea");
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error("missing composer");
  }
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(field, text);
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  const send = container.querySelector('button[aria-label="Envoyer"]');
  if (!(send instanceof HTMLButtonElement)) {
    throw new Error("missing send");
  }
  await act(async () => {
    send.click();
  });
}

function trackScroll(thread: HTMLElement, height: number): { top: number } {
  const scrolled = { top: 0 };
  const page = thread.closest(".chat-page");
  const clientHeight = (): number => {
    if (!(page instanceof HTMLElement)) {
      return 0;
    }
    const inline = Number.parseFloat(page.style.height);
    return Number.isFinite(inline) ? inline : 0;
  };
  const clamp = (value: number): number => {
    const max = Math.max(0, thread.scrollHeight - clientHeight());
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(Math.max(0, value), max);
  };
  Object.defineProperty(thread, "scrollHeight", {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(thread, "clientHeight", {
    configurable: true,
    get: clientHeight,
  });
  Object.defineProperty(thread, "scrollTop", {
    configurable: true,
    get: () => clamp(scrolled.top),
    set: (value: number) => {
      scrolled.top = clamp(value);
    },
  });
  return scrolled;
}

function filledImageBox(
  frame: CSSStyleDeclaration,
  photo: CSSStyleDeclaration,
): { readonly width: number; readonly height: number } {
  if (photo.width !== "100%" || photo.height !== "100%") {
    throw new Error(
      `avatar image does not fill the frame: ${photo.width} ${photo.height}`,
    );
  }
  const margin = [
    photo.marginTop,
    photo.marginRight,
    photo.marginBottom,
    photo.marginLeft,
  ];
  if (margin.some((value) => side(value) !== 0)) {
    throw new Error("avatar image has margin");
  }
  return {
    width:
      side(frame.width) -
      side(frame.paddingLeft) -
      side(frame.paddingRight) -
      side(frame.borderLeftWidth) -
      side(frame.borderRightWidth),
    height:
      side(frame.height) -
      side(frame.paddingTop) -
      side(frame.paddingBottom) -
      side(frame.borderTopWidth) -
      side(frame.borderBottomWidth),
  };
}

function side(value: string): number {
  if (value.trim() === "") {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`not a length: ${value}`);
  }
  return parsed;
}

function clear(color: string): boolean {
  if (color.trim() === "transparent") {
    return true;
  }
  const match =
    /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)$/.exec(color.trim());
  return match !== null && Number(match[1]) === 0;
}

function channels(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex !== null) {
    const value = hex[1] ?? "";
    return rgb(
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    );
  }
  const match =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/.exec(
      color.trim(),
    );
  if (match === null) {
    return color;
  }
  return rgb(Number(match[1]), Number(match[2]), Number(match[3]));
}

function rgb(red: number, green: number, blue: number): string {
  return `rgb(${red}, ${green}, ${blue})`;
}

async function flushFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function mount(
  node: ReturnType<typeof createElement> = createElement(ChatPage),
): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {
    throw new Error("deferred resolve was called before setup");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const roots: Root[] = [];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});
