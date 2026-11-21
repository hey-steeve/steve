// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { chatRequestLimits } from "../../chat/request.js";
import RootLayout from "../layout.js";
import ChatPage from "./page.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

it("renders the profile button with aria-label Profil", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain('aria-label="Profil"');
});

it("limits the composer to the user message cap", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain(`maxLength="${chatRequestLimits.maxMessageChars}"`);
});

it("keeps the profile button on the home screen only", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  const view = await mount();
  expect(
    view.container.querySelector('.chat-header [aria-label="Profil"]'),
  ).not.toBeNull();

  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }
  await act(async () => {
    chip.click();
  });

  const header = view.container.querySelector(".chat-header");
  expect(header?.querySelector('[aria-label="Profil"]')).toBeNull();
  expect(header?.querySelector('[aria-label="Retour"]')).not.toBeNull();
  expect(header?.querySelector(".chat-title")?.textContent).toContain("Steve");
  expect(header?.querySelector(".chat-header-spacer")).not.toBeNull();
  expect(view.container.querySelector(".chat-avatar-user")).not.toBeNull();
  expect(view.container.querySelector(".chat-avatar-agent")).not.toBeNull();

  await act(async () => {
    header
      ?.querySelector('[aria-label="Retour"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(
    view.container.querySelector('.chat-header [aria-label="Profil"]'),
  ).not.toBeNull();
});

it("renders the home greeting", async () => {
  const view = await mount();
  expect(view.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour,",
  );
  expect(view.container.querySelector('[aria-label="Retour"]')).toBeNull();
});

it("paints the home chips and composer with the lavender tokens", async () => {
  const fill = designTokens.color.lavender50;
  const edge = designTokens.color.lavender100;
  const canvas = designTokens.color.canvas;
  expect(fill).not.toBe(designTokens.color.indigo50);
  expect(edge).not.toBe(designTokens.color.indigo100);
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
    const sheet = view.container.querySelector(".chat-sheet");
    const composer = view.container.querySelector(".chat-sheet .chat-composer");
    const chips = [
      ...view.container.querySelectorAll(".chat-sheet .chat-chip"),
    ];
    if (!(sheet instanceof HTMLElement) || !(composer instanceof HTMLElement)) {
      throw new Error("missing home sheet");
    }
    expect(chips).toHaveLength(4);
    expect(channels(getComputedStyle(sheet).backgroundColor)).toBe(
      channels(canvas),
    );
    for (const chip of chips) {
      if (!(chip instanceof HTMLElement)) {
        throw new Error("missing suggestion");
      }
      expect(channels(getComputedStyle(chip).backgroundColor)).toBe(
        channels(fill),
      );
      expect(channels(getComputedStyle(chip).borderTopColor)).toBe(
        channels(edge),
      );
    }
    expect(channels(getComputedStyle(composer).backgroundColor)).toBe(
      channels(fill),
    );
    expect(
      containsColor(getComputedStyle(composer).boxShadow, edge),
    ).toBe(true);
    const chip = chips[0];
    if (!(chip instanceof HTMLElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });
    const dock = view.container.querySelector(
      ".chat-column > .chat-dock .chat-composer",
    );
    if (!(dock instanceof HTMLElement)) {
      throw new Error("missing chat composer");
    }
    expect(channels(getComputedStyle(dock).backgroundColor)).toBe(
      channels(canvas),
    );
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
    "Steve n'est pas un médecin ni un dispositif médical.",
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
  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }

  await act(async () => {
    chip.click();
  });

  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Prendre rendez-vous chez un généraliste",
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
        model: "google/gemini-3.8-flash",
      }),
    ),
  );
  try {
    const view = await mount();
    const chip = view.container.querySelector(".chat-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });

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
  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }

  await act(async () => {
    chip.click();
  });

  expect(view.container.querySelector(".chat-hero")).not.toBeNull();
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
  });

  expect(view.container.querySelector(".chat-hero")).toBeNull();
  expect(view.container.querySelector(".chat-user")?.textContent).toContain(
    "Prendre rendez-vous chez un généraliste",
  );
  expect(view.container.querySelector('[aria-label="Retour"]')).not.toBeNull();
});

it("drops the covering home sheet when its leave animation is cancelled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const view = await mount();
  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }

  await act(async () => {
    chip.click();
  });
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
    "Prendre rendez-vous chez un généraliste",
  );
});

it("drops the covering home sheet when its leave animation ends", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const view = await mount();
  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }

  await act(async () => {
    chip.click();
  });
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
    "Prendre rendez-vous chez un généraliste",
  );
});

it("ignores a home leave animationend that arrives after Retour", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() => new Promise(() => {})),
  );
  const captured: Array<{
    node: HTMLElement;
    listener: (event: AnimationEvent) => void;
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
          listener: listener as (event: AnimationEvent) => void,
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
    const chip = view.container.querySelector(".chat-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });
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
    await act(async () => {
      homeLeave.listener.call(homeLeave.node, {
        target: homeLeave.node,
        animationName: "chat-home-out",
      } as unknown as AnimationEvent);
    });
    expect(view.container.querySelector(".chat-greeting")?.textContent).toBe(
      "Bonjour,",
    );
    expect(view.container.querySelector(".chat-hero")).not.toBeNull();
    expect(view.container.querySelector(".chat-field")).not.toBeNull();
  } finally {
    spy.mockRestore();
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
  const listeners = new Map<string, Array<() => void>>();
  const viewport = {
    height: 844,
    offsetTop: 0,
    scale: 1,
    addEventListener(type: string, listener: EventListener) {
      const current = listeners.get(type) ?? [];
      current.push(listener as () => void);
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
    const chip = view.container.querySelector(".chat-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });
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
        listener();
      }
      for (const listener of listeners.get("scroll") ?? []) {
        listener();
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

it("returns to the empty home state from Retour in the conversation header", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const reply = deferred<Response>();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => reply.promise),
  );
  const view = await mount();
  const header = () => view.container.querySelector(".chat-header");
  const chip = view.container.querySelector(".chat-chip");
  expect(chip).not.toBeNull();

  await act(async () => {
    chip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(view.container.querySelector(".chat-thread")?.textContent).toContain(
    "Prendre rendez-vous chez un généraliste",
  );
  const back = header()?.querySelector('[aria-label="Retour"]');
  expect(back).not.toBeNull();
  expect(view.container.querySelector(".chat-greeting")).toBeNull();

  await act(async () => {
    back?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  expect(view.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour,",
  );
  expect(header()?.querySelector('[aria-label="Retour"]')).toBeNull();
  expect(view.container.querySelector(".chat-thread")).toBeNull();

  await act(async () => {
    vi.advanceTimersByTime(300);
  });

  expect(view.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour,",
  );
  expect(view.container.querySelector(".chat-hero")).not.toBeNull();
  expect(view.container.querySelector(".chat-field")).not.toBeNull();
  expect(view.container.querySelector(".chat-thread")).toBeNull();

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

  expect(view.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour,",
  );
  expect(view.container.textContent).not.toContain("Réponse tardive.");
  expect(view.container.querySelector(".chat-thread")).toBeNull();
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
      text: "Nouveau message ↓",
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
  session.thread.scrollTo = ((options?: ScrollToOptions | number) => {
    if (typeof options === "object" && options !== null) {
      requested.push(options);
    }
  }) as typeof session.thread.scrollTo;
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
  session.thread.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
    const behavior = typeof options === "object" && options !== null ? options.behavior : "auto";
    motions.push(behavior);
    if (behavior === "smooth") {
      return;
    }
    const top = typeof options === "object" && options !== null ? (options.top ?? 0) : (y ?? 0);
    session.scrolled.top = top;
    session.thread.dispatchEvent(new Event("scroll"));
  }) as typeof session.thread.scrollTo;
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
      "Nouveau message ↓",
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
    expect(newMessagePill(session.container)).toBeNull();
    expect(session.scrolled.top).toBe(0);
    expect(session.container.querySelector(".chat-greeting")?.textContent).toBe(
      "Bonjour,",
    );
  } finally {
    session.restore();
  }
});

const threadLength = 2000;

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
  const listeners = new Map<string, Array<() => void>>();
  const viewport = {
    height: initial.height,
    offsetTop: initial.offsetTop,
    scale: initial.scale ?? 1,
    addEventListener(type: string, listener: EventListener) {
      const current = listeners.get(type) ?? [];
      current.push(listener as () => void);
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
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener();
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
  const chip = view.container.querySelector(".chat-chip");
  if (!(chip instanceof HTMLButtonElement)) {
    throw new Error("missing suggestion");
  }
  await act(async () => {
    chip.click();
  });
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

function stubReducedMotion(matches: boolean): () => void {
  const previous = window.matchMedia;
  const queryList = (query: string): MediaQueryList =>
    ({
      matches: matches && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }) as MediaQueryList;
  window.matchMedia = queryList;
  return () => {
    window.matchMedia = previous;
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
    const chip = view.container.querySelector(".chat-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });
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

function containsColor(value: string, color: string): boolean {
  const compact = value.toLowerCase().replaceAll(" ", "");
  if (compact.includes(color.toLowerCase())) {
    return true;
  }
  const parts = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(
    channels(color).replaceAll(" ", ""),
  );
  if (parts === null) {
    return false;
  }
  return compact.includes(`${parts[1]},${parts[2]},${parts[3]}`);
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
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});
