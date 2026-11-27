// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import InboxPage from "./page.js";

const sendControl = vi.hoisted(() => ({ failNext: false }));

vi.mock("@steve/inbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@steve/inbox")>();
  return {
    ...actual,
    createInbox: (...args: Parameters<typeof actual.createInbox>) => {
      const inbox = actual.createInbox(...args);
      return {
        ingestMessage: (message: unknown) => inbox.ingestMessage(message),
        sendDocument: (request: unknown) => {
          if (sendControl.failNext) {
            sendControl.failNext = false;
            return Promise.reject(new Error("gateway down"));
          }
          return inbox.sendDocument(request);
        },
      };
    },
  };
});

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Root[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(InboxPage));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return container;
}

function buttonWithText(container: ParentNode, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return found;
}

it("renders the Steve address and ingested inbox items with status badges", async () => {
  const container = await mount();
  expect(container.querySelector("h1")?.textContent).toBe("Ma messagerie");
  expect(container.textContent).toContain("Ton adresse Steve");
  expect(container.textContent).toContain("peter@steve.example");
  expect(container.textContent).toContain("Confirmation de rendez-vous");
  expect(container.textContent).toContain("À vérifier");
  expect(container.textContent).toContain("Document du cabinet");
  expect(container.textContent).toContain("Document reçu");
});

it("copies the Steve email address and inspects received item details", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const container = await mount();
  const copy = container.querySelector('button[aria-label="Copier l’adresse Steve"]');
  if (!(copy instanceof HTMLButtonElement)) throw new Error("Missing copy button");
  await act(async () => {
    copy.click();
  });
  expect(writeText).toHaveBeenCalledWith("peter@steve.example");
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "peter@steve.example",
  );

  await act(async () => {
    buttonWithText(container, "Confirmation de rendez-vous").click();
  });
  expect(container.textContent).toContain("CONF-0001");
  expect(container.querySelector('a[href="/agenda"]')?.textContent).toContain(
    "Vérifier dans l’agenda",
  );
});

it("sends an authorized document through @steve/inbox", async () => {
  const container = await mount();
  await act(async () => {
    buttonWithText(container, "Envoyer un document").click();
  });
  await act(async () => {
    buttonWithText(container, "Confirmer l’envoi").click();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Confirme ton autorisation",
  );
  const consent = container.querySelector('input[type="checkbox"]');
  if (!(consent instanceof HTMLInputElement)) throw new Error("Missing consent checkbox");
  expect(consent.checked).toBe(false);
  await act(async () => {
    consent.click();
  });
  await act(async () => {
    buttonWithText(container, "Confirmer l’envoi").click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Envoi simulé à cabinet.luneval@example.test",
  );

  await act(async () => {
    buttonWithText(container, "Envoyer un document").click();
  });
  const secondConsent = container.querySelector('input[type="checkbox"]');
  if (!(secondConsent instanceof HTMLInputElement)) throw new Error("Missing consent checkbox");
  expect(secondConsent.checked).toBe(false);
});

it("does not claim the address was copied when the clipboard is unavailable", async () => {
  vi.stubGlobal("navigator", {});
  const container = await mount();
  const copy = container.querySelector('button[aria-label="Copier l’adresse Steve"]');
  if (!(copy instanceof HTMLButtonElement)) throw new Error("Missing copy button");
  await act(async () => {
    copy.click();
  });
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Copie impossible");
});

it("clears the consent when the send form is closed or the recipient changes", async () => {
  const container = await mount();
  const openForm = () => buttonWithText(container, "Envoyer un document");
  const consentBox = () => {
    const box = container.querySelector('input[type="checkbox"]');
    if (!(box instanceof HTMLInputElement)) throw new Error("Missing consent checkbox");
    return box;
  };
  await act(async () => {
    openForm().click();
  });
  await act(async () => {
    consentBox().click();
  });
  expect(consentBox().checked).toBe(true);

  await act(async () => {
    openForm().click();
  });
  await act(async () => {
    openForm().click();
  });
  expect(consentBox().checked).toBe(false);

  await act(async () => {
    consentBox().click();
  });
  const recipient = container.querySelector("#inbox-recipient");
  if (!(recipient instanceof HTMLInputElement)) throw new Error("Missing recipient input");
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(recipient, "autre.cabinet@example.test");
    recipient.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(consentBox().checked).toBe(false);
});

it("shows an error and re-enables the form when the send throws", async () => {
  const container = await mount();
  await act(async () => {
    buttonWithText(container, "Envoyer un document").click();
  });
  const consent = container.querySelector('input[type="checkbox"]');
  if (!(consent instanceof HTMLInputElement)) throw new Error("Missing consent checkbox");
  await act(async () => {
    consent.click();
  });
  sendControl.failNext = true;
  await act(async () => {
    buttonWithText(container, "Confirmer l’envoi").click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Impossible d’envoyer ce document pour le moment",
  );
  expect(buttonWithText(container, "Confirmer l’envoi").disabled).toBe(false);
});
