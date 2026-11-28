// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import VaultClient from "./vault-client.js";
import { loadDemoVaultSnapshot, summarizeTextDocumentAction } from "./vault-server.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function mount(node: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  return container;
}

const instant = { faceIdTimings: { scanMs: 0, successMs: 0 } } as const;

function buttonWithText(container: ParentNode, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return found;
}

it("loads the factual demo appointment letter summary from @steve/vault", async () => {
  const initialDocuments = await loadDemoVaultSnapshot();
  expect(initialDocuments).toHaveLength(1);
  expect(initialDocuments[0]?.title).toBe("Appointment letter");
  expect(initialDocuments[0]?.summaryLines).toEqual([
    "The letter states an appointment on 2 December at 10:00.",
  ]);

  const container = await mount(createElement(VaultClient, { initialDocuments, ...instant }));
  expect(container.querySelector("h1")?.textContent).toBe("Vault");
  expect(container.textContent).toContain("Appointment letter");
  expect(container.textContent).toContain("27 November 2026");
  expect(container.textContent).toContain("Document summary");
  expect(container.textContent).toContain(
    "The letter states an appointment on 2 December at 10:00.",
  );

  await act(async () => {
    buttonWithText(container, "Open the document").click();
  });
  expect(container.querySelector(".vault-content-box")?.textContent).toContain(
    "Camille Lunéval",
  );
});

it("ingests and summarizes a new synthetic text document through @steve/vault", async () => {
  const initialDocuments = await loadDemoVaultSnapshot();
  const container = await mount(
    createElement(VaultClient, {
      ...instant,
      initialDocuments,
      onAddDocument: summarizeTextDocumentAction,
    }),
  );

  await act(async () => {
    buttonWithText(container, "Add a text document").click();
  });
  const titleInput = container.querySelector("#vault-doc-title");
  const textInput = container.querySelector("#vault-doc-text");
  if (!(titleInput instanceof HTMLInputElement) || !(textInput instanceof HTMLTextAreaElement)) {
    throw new Error("Missing vault form fields");
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      titleInput,
      "Convocation radio",
    );
    titleInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      textInput,
      "La convocation confirme un examen le 5 décembre à 9 h.",
    );
    textInput.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await act(async () => {
    buttonWithText(container, "Save and summarize").click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(container.textContent).toContain("Convocation radio");
  expect(container.textContent).toContain(
    "La convocation confirme un examen le 5 décembre à 9 h.",
  );
});

it("labels the demo text letter as TXT", async () => {
  const documents = await loadDemoVaultSnapshot();
  expect(documents[0]?.fileName).toBe("appointment-letter.txt");
  expect(documents[0]?.formatLabel).toBe("TXT");
});

it("returns a clean error when the action input is not text", async () => {
  const result: unknown = await Reflect.apply(summarizeTextDocumentAction, undefined, [
    { title: 42, text: null },
  ]);
  expect(result).toMatchObject({ ok: false });
});

it("builds an ASCII file name from an accented title", async () => {
  const accented = await summarizeTextDocumentAction({
    title: "Prescription été",
    text: "Rendez-vous administratif confirmé le 4 décembre.",
  });
  expect(accented).toMatchObject({ ok: true, document: { fileName: "prescription-ete.txt" } });
  const symbolsOnly = await summarizeTextDocumentAction({
    title: "***",
    text: "Rendez-vous administratif confirmé le 4 décembre.",
  });
  expect(symbolsOnly).toMatchObject({ ok: true, document: { fileName: "document.txt" } });
});

it("locks the Vault on every visit and opens it after the mocked Face ID scan", async () => {
  vi.useFakeTimers();
  try {
    const initialDocuments = await loadDemoVaultSnapshot();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(createElement(VaultClient, { initialDocuments }));
    });
    expect(container.querySelector("#faceid-title")?.textContent).toBe("Vault locked");
    expect(container.querySelector(".faceid-hud")?.getAttribute("data-phase")).toBe("scanning");
    expect(container.textContent).toContain("Look at your phone");
    expect(container.textContent).not.toContain("Appointment letter");

    await act(async () => vi.advanceTimersByTime(1400));
    expect(container.querySelector(".faceid-hud")?.getAttribute("data-phase")).toBe("success");
    expect(container.querySelector(".faceid-hud")?.textContent).toBe("Unlocked");

    await act(async () => vi.advanceTimersByTime(750));
    expect(container.querySelector(".faceid-hud")).toBeNull();
    expect(container.textContent).toContain("Appointment letter");

    await act(async () => buttonWithText(container, "Lock the Vault").click());
    expect(container.querySelector(".faceid-title")).not.toBeNull();
    expect(container.textContent).not.toContain("Appointment letter");
    await act(async () => buttonWithText(container, "Unlock with Face ID").click());
    expect(container.querySelector(".faceid-hud")?.getAttribute("data-phase")).toBe("scanning");
  } finally {
    vi.useRealTimers();
  }
});
