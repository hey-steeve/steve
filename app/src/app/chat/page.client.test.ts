// @vitest-environment happy-dom

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { writingField } from "./test-writing.js";
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
  const field = writingField(container);
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

it("shows a typing indicator for a plain reply and attaches no trace", async () => {
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

  const typing = container.querySelector('[aria-label="Stevie écrit"]');
  expect(typing?.getAttribute("aria-live")).toBe("polite");
  expect(typing?.querySelectorAll(".chat-dot")).toHaveLength(3);
  expect(container.querySelector(".chat-trace")).toBeNull();

  const finish = pending[0];
  if (finish === undefined) {
    throw new Error("missing release");
  }
  const reply = Response.json({ reply: "D'accord.", mocked: true, model: "mock" });
  reply.headers.set("x-steve-triage", "consult");
  await act(async () => {
    finish(reply);
  });

  expect(container.querySelector('[aria-label="Stevie écrit"]')).toBeNull();
  expect(container.textContent).toContain("D'accord.");
  expect(container.querySelector(".chat-trace-summary")).toBeNull();
});

it("traces a practitioner search live, then folds it above the result", async () => {
  const reply = Response.json({ directory: { specialty: "médecin généraliste", postalCode: "75011" } });
  reply.headers.set("x-steve-triage", "consult");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => reply));
  const container = await renderPage();
  await act(async () => {
    setField(fieldIn(container), "Je cherche un généraliste près de 75011");
  });
  await act(async () => {
    sendButton(container).click();
  });
  for (let tries = 0; tries < 20 && container.querySelector(".chat-trace-summary") === null; tries += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  const summary = container.querySelector(".chat-trace-summary");
  if (!(summary instanceof HTMLButtonElement)) {
    throw new Error("missing trace summary");
  }
  expect(container.querySelector('[aria-label="Stevie réfléchit"]')).toBeNull();
  expect(summary.getAttribute("aria-expanded")).toBe("false");
  expect(summary.textContent).toMatch(/^Réfléchi \d+ s · 4 étapes$/);
  await act(async () => summary.click());
  expect(
    [...container.querySelectorAll(".chat-trace-step-title")].map((step) => step.textContent),
  ).toEqual([
    "Je lis ta demande",
    "Je vérifie s’il y a une urgence",
    "Je cherche : médecin généraliste près de 75011",
    "Je prépare ma réponse",
  ]);
  expect(container.textContent).toContain("Pas de signe d’urgence repéré");
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

it("keeps the composer off the home screen and focuses it from Écrire à Stevie", async () => {
  const container = await renderPage();
  expect(container.querySelector(".chat-field")).toBeNull();
  expect(container.querySelector(".chat-thread")).toBeNull();
  const field = fieldIn(container);
  await act(async () => {});
  expect(document.activeElement).toBe(field);
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
});

function buttonWithText(container: ParentNode, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (button === undefined) {
    throw new Error(`Missing button: ${text}`);
  }
  return button;
}
