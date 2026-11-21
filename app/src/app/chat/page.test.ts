// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { chatRequestLimits } from "../../chat/request.js";
import ChatPage from "./page.js";

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
    "Hey",
  );
  expect(view.container.querySelector('[aria-label="Retour"]')).toBeNull();
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
      "Hey",
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
    const scrolled = trackScroll(thread, 900, 200);
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
    expect({
      top: page.style.top,
      height: page.style.height,
      transform: page.style.transform,
      position: getComputedStyle(page).position,
      keyboard: page.getAttribute("data-keyboard-open"),
      disclaimer: getComputedStyle(disclaimer).display,
      scrollTop: scrolled.top,
      overflow: document.documentElement.style.overflow,
      overscroll: document.documentElement.style.overscrollBehavior,
    }).toEqual({
      top: "180px",
      height: "420px",
      transform: "",
      position: "fixed",
      keyboard: "",
      disclaimer: "none",
      scrollTop: 900,
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
    const { page, scrolled } = await scrolledThread();
    scrolled.top = threadLength - threadWindow;
    viewport.setInnerHeight(700);
    viewport.height = 690;
    viewport.offsetTop = 12;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(false);
    expect(scrolled.top).toBe(threadLength);
  } finally {
    viewport.restore();
  }
});

it("keeps the latest reply visible when the keyboard opens at the bottom of the thread", async () => {
  stubReply();
  const viewport = installViewport({ height: 844, offsetTop: 0, innerHeight: 844 });
  try {
    const { page, scrolled } = await scrolledThread();
    scrolled.top = threadLength - threadWindow;
    viewport.height = 420;
    viewport.offsetTop = 180;
    await fireViewport(viewport);
    expect(page.hasAttribute("data-keyboard-open")).toBe(true);
    expect(scrolled.top).toBe(threadLength);
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
    "Hey",
  );
  expect(header()?.querySelector('[aria-label="Retour"]')).toBeNull();
  expect(view.container.querySelector(".chat-thread")).toBeNull();

  await act(async () => {
    vi.advanceTimersByTime(300);
  });

  expect(view.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Hey",
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
    "Hey",
  );
  expect(view.container.textContent).not.toContain("Réponse tardive.");
  expect(view.container.querySelector(".chat-thread")).toBeNull();
});

const threadLength = 900;
const threadWindow = 200;

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
  setInnerHeight(value: number): void;
  fire(type: string): void;
  restore(): void;
};

function installViewport(initial: {
  height: number;
  offsetTop: number;
  innerHeight: number;
}): ViewportStub {
  const listeners = new Map<string, Array<() => void>>();
  const viewport = {
    height: initial.height,
    offsetTop: initial.offsetTop,
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
  return { page, scrolled: trackScroll(thread, threadLength, threadWindow) };
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

function trackScroll(
  thread: HTMLElement,
  height: number,
  client: number,
): { top: number } {
  const scrolled = { top: 0 };
  Object.defineProperty(thread, "scrollHeight", {
    configurable: true,
    get: () => height,
  });
  Object.defineProperty(thread, "clientHeight", {
    configurable: true,
    get: () => client,
  });
  Object.defineProperty(thread, "scrollTop", {
    configurable: true,
    get: () => scrolled.top,
    set: (value: number) => {
      scrolled.top = value;
    },
  });
  return scrolled;
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

async function mount(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ChatPage));
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
