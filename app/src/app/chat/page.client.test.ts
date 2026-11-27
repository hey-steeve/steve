// @vitest-environment happy-dom

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import ChatPage from "./chat-page.js";

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

async function sendForReply(body: unknown, status: number): Promise<HTMLDivElement> {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json(body, { status })));
  const container = await renderPage();
  await act(async () => {
    setField(fieldIn(container), "Bonjour");
  });
  await act(async () => {
    sendButton(container).click();
  });
  return container;
}

function expectCallActions(container: ParentNode, bubble: string, numbers: readonly string[]) {
  const links = [...container.querySelectorAll('a[href^="tel:"]')];
  expect(links.map((link) => ({
    href: link.getAttribute("href"),
    label: link.textContent,
    inBubble: link.closest(bubble) !== null,
  }))).toEqual(numbers.map((number) => ({
    href: `tel:${number}`,
    label: `Appeler le ${number}`,
    inBubble: true,
  })));
}

it.each([
  { numbers: [] },
  { numbers: ["15"] },
  { numbers: ["3114"] },
  { numbers: ["15", "3114"] },
  { numbers: ["3114", "15"] },
])("renders the 200 reply with call actions in order for $numbers", async ({ numbers }) => {
  const reply = "Voici ma réponse.";
  const calls = numbers.length ? numbers.map((number) => ({ type: "call", number })) : undefined;
  const container = await sendForReply({ reply, mocked: true, model: "mock", calls }, 200);

  expect(container.querySelector(".chat-agent-text")?.textContent).toBe(reply);
  expectCallActions(container, ".chat-agent", numbers);
});

it.each([
  { name: "a valid call", calls: [{ type: "call", number: "15" }], expected: ["15"] },
  {
    name: "15 followed by 3114",
    calls: [{ type: "call", number: "15" }, { type: "call", number: "3114" }],
    expected: ["15", "3114"],
  },
  {
    name: "3114 followed by 15",
    calls: [{ type: "call", number: "3114" }, { type: "call", number: "15" }],
    expected: ["3114", "15"],
  },
  { name: "no calls", calls: undefined, expected: [] },
  { name: "an invalid call", calls: [{ type: "call", number: "112" }], expected: [] },
])("preserves the 502 error text with $name", async ({ calls, expected }) => {
  const error = "La réponse est indisponible.";
  const container = await sendForReply({ error, calls }, 502);

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(error);
  expectCallActions(container, ".chat-error", expected);
});

it("preserves the 500 error text and hides valid call actions", async () => {
  const error = "La réponse est indisponible.";
  const calls = [{ type: "call", number: "15" }];
  const container = await sendForReply({ error, calls }, 500);

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(error);
  expectCallActions(container, ".chat-error", []);
});

it("shows the live thinking trace while the reply is pending, then folds it above the reply", async () => {
  const pending: Array<(value: Response | PromiseLike<Response>) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    ),
  );
  const container = await renderPage();

  await act(async () => {
    setField(fieldIn(container), "Bonjour");
  });
  act(() => {
    sendButton(container).click();
  });

  const live = container.querySelector('[aria-label="Steve réfléchit"]');
  expect(live?.getAttribute("aria-live")).toBe("polite");
  expect([...(live?.querySelectorAll(".chat-trace-step") ?? [])].map((step) => step.className)).toEqual([
    "chat-trace-step chat-trace-done",
    "chat-trace-step chat-trace-doing",
  ]);
  expect(live?.textContent).toContain("Je lis ta demande");
  expect(container.querySelector(".chat-agent")).toBeNull();

  const finish = pending[0];
  if (finish === undefined) {
    throw new Error("missing release");
  }
  const reply = Response.json({ reply: "D'accord.", mocked: true, model: "mock" });
  reply.headers.set("x-steve-triage", "consult");
  await act(async () => {
    finish(reply);
  });

  expect(container.querySelector('[aria-label="Steve réfléchit"]')).toBeNull();
  expect(container.textContent).toContain("D'accord.");
  const summary = container.querySelector(".chat-agent-stack .chat-trace-summary");
  if (!(summary instanceof HTMLButtonElement)) {
    throw new Error("missing trace summary");
  }
  expect(summary.getAttribute("aria-expanded")).toBe("false");
  expect(summary.textContent).toMatch(/^Réfléchi \d+ s · 3 étapes$/);
  await act(async () => summary.click());
  const steps = [...container.querySelectorAll(".chat-agent-stack .chat-trace-step-title")].map(
    (step) => step.textContent,
  );
  expect(steps).toEqual([
    "Je lis ta demande",
    "Je vérifie s’il y a une urgence",
    "Je prépare ma réponse",
  ]);
  expect(container.textContent).toContain("Pas de signe d’urgence repéré");
});

it("leaves the urgency step out when triage did not run", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => Response.json({ reply: "D'accord.", mocked: true, model: "mock" })),
  );
  const container = await renderPage();
  await act(async () => {
    setField(fieldIn(container), "Bonjour");
  });
  await act(async () => {
    sendButton(container).click();
  });
  const summary = container.querySelector(".chat-trace-summary");
  expect(summary?.textContent).toMatch(/· 2 étapes$/);
  expect(container.textContent).not.toContain("urgence");
});

it("disables send while the chat request is in flight", async () => {
  const pending: Array<(value: Response | PromiseLike<Response>) => void> = [];
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const container = await renderPage();

  await act(async () => {
    setField(fieldIn(container), "Bonjour");
  });
  act(() => {
    sendButton(container).click();
  });
  await act(async () => {
    setField(fieldIn(container), "Encore");
  });

  const button = sendButton(container);
  expect(button.disabled).toBe(true);
  await act(async () => {
    button.click();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const finish = pending[0];
  if (finish === undefined) {
    throw new Error("missing release");
  }
  await act(async () => {
    finish(Response.json({ reply: "D'accord.", mocked: true, model: "mock" }));
  });
});

it("does not autofocus the composer on the home screen", async () => {
  const container = await renderPage();
  expect(document.activeElement).not.toBe(fieldIn(container));
  expect(container.querySelector(".chat-thread")).toBeNull();
});

it("keeps the composer focused after the first send", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ reply: "D'accord.", mocked: true, model: "mock" }),
    ),
  );
  const container = await renderPage();
  const field = fieldIn(container);
  field.focus();
  expect(document.activeElement).toBe(field);

  await act(async () => {
    setField(field, "Bonjour");
  });
  await act(async () => {
    sendButton(container).click();
  });

  expect(document.activeElement).toBe(fieldIn(container));
});

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

it("prefills an editable starter without sending it", async () => {
  const fetchChat = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchChat);
  const container = await renderPage();
  const starter = buttonWithText(container, "Préparer une consultation");

  await act(async () => starter.click());

  const field = fieldIn(container);
  expect(field.value).toBe("Peux-tu m’aider à préparer ma prochaine consultation ?");
  expect(document.activeElement).toBe(field);
  expect(fetchChat).not.toHaveBeenCalled();
  await act(async () => setField(field, "Je prépare une consultation lundi."));
  expect(field.value).toBe("Je prépare une consultation lundi.");
});

it("keeps the transcript after finishing and clears it for the next conversation", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const container = await sendForReply(
    { reply: "Voici ma réponse.", mocked: true, model: "mock" },
    200,
  );

  const finish = container.querySelector('header button[aria-label="Terminer la conversation"]');
  if (!(finish instanceof HTMLButtonElement)) {
    throw new Error("Missing finish action in the chat header");
  }
  expect(container.querySelector('.chat-dock button[aria-label="Terminer la conversation"]')).toBeNull();

  await act(async () => finish.click());

  expect(container.querySelector(".chat-thread")?.textContent).toContain("Voici ma réponse.");
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.querySelector("h2")?.textContent).toBe("Conversation terminée");
  const restart = buttonWithText(container, "Nouvelle conversation");
  expect(document.activeElement).toBe(restart);

  await act(async () => restart.click());

  expect(container.querySelector(".chat-thread")).toBeNull();
  expect(fieldIn(container).value).toBe("");
  expect(buttonWithText(container, "Préparer une consultation")).toBeTruthy();
});

function buttonWithText(container: ParentNode, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (button === undefined) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}
