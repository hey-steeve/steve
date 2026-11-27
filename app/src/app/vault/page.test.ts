// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
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

it("loads the factual demo appointment letter summary from @steve/vault", async () => {
  const initialDocuments = await loadDemoVaultSnapshot();
  expect(initialDocuments).toHaveLength(1);
  expect(initialDocuments[0]?.title).toBe("Lettre de rendez-vous");
  expect(initialDocuments[0]?.summaryLines).toEqual([
    "La lettre indique un rendez-vous le 2 décembre à 10 h.",
  ]);

  const container = await mount(createElement(VaultClient, { initialDocuments }));
  expect(container.querySelector("h1")?.textContent).toBe("Mes documents");
  expect(container.textContent).toContain("Lettre de rendez-vous");
  expect(container.textContent).toContain("27 novembre 2026");
  expect(container.textContent).toContain("Résumé du document");
  expect(container.textContent).toContain(
    "La lettre indique un rendez-vous le 2 décembre à 10 h.",
  );

  await act(async () => {
    buttonWithText(container, "Ouvrir le document").click();
  });
  expect(container.querySelector(".vault-content-box")?.textContent).toContain(
    "Camille Lunéval",
  );
});

it("ingests and summarizes a new synthetic text document through @steve/vault", async () => {
  const initialDocuments = await loadDemoVaultSnapshot();
  const container = await mount(
    createElement(VaultClient, {
      initialDocuments,
      onAddDocument: summarizeTextDocumentAction,
    }),
  );

  await act(async () => {
    buttonWithText(container, "Ajouter un document texte").click();
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
    buttonWithText(container, "Enregistrer et résumer").click();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(container.textContent).toContain("Convocation radio");
  expect(container.textContent).toContain(
    "La convocation confirme un examen le 5 décembre à 9 h.",
  );
});
