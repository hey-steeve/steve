// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import DirectoryPage from "./page.js";

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(DirectoryPage)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

function input(selector: string): HTMLInputElement {
  const field = container.querySelector(selector);
  if (!(field instanceof HTMLInputElement)) throw new Error(`Missing input ${selector}`);
  return field;
}

async function changeInput(field: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.click());
}

function names() {
  return Array.from(container.querySelectorAll("h3"), (item) => item.textContent);
}

it("renders the default practitioners in distance order with their contact details", () => {
  expect(container.querySelector('a[href="/chat"]')?.textContent).toContain("Retour");
  expect(input('[aria-label="Spécialité"]').value).toBe("Médecin généraliste");
  expect(input('[autocomplete="postal-code"]').value).toBe("75011");
  expect(names()).toEqual(["Camille Lunéval", "Noé Brumelac"]);
  const card = container.querySelector(".directory-card")?.textContent;
  for (const detail of ["Médecine générale", "Secteur 1", "1 rue des Nuages Mauves, 75011 Paris", "1,2 km", "00 00 00 00 01"]) {
    expect(card).toContain(detail);
  }
});

it("shows an empty state and restores the defaults when resetting", async () => {
  await clickButton("Pédiatre");
  expect(container.textContent).toContain("Aucun praticien trouvé pour ces critères.");
  expect(names()).toEqual([]);
  await clickButton("Réinitialiser les filtres");
  expect(container.textContent).not.toContain("Aucun praticien trouvé");
  expect(names()).toEqual(["Camille Lunéval", "Noé Brumelac"]);
});

it("combines optional postal, sector, and distance filters", async () => {
  await changeInput(input('[autocomplete="postal-code"]'), "");
  expect(names()).toContain("Lina Ormelune");
  await clickButton("Secteur 1");
  expect(names()).toEqual(["Camille Lunéval", "Lina Ormelune"]);
  const select = container.querySelector("select");
  if (!select) throw new Error("Missing distance selector");
  await act(async () => {
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(names()).toEqual(["Camille Lunéval"]);
});

it.each([
  ['[aria-label="Spécialité"]', "Astronaute", "Spécialité non reconnue. Essayez par exemple généraliste, dermatologue ou dentiste."],
  ['[autocomplete="postal-code"]', "7501", "Code postal invalide (5 chiffres attendus)."],
])("shows an inline validation error for %s", async (selector, value, message) => {
  const field = input(selector);
  await changeInput(field, value);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(message);
  expect(field.getAttribute("aria-describedby")).toBe(alert?.id);
  expect(names()).toEqual([]);
  expect(container.textContent).not.toContain("Aucun praticien trouvé");
});

it("links each practitioner card to the booking page with their RPPS", () => {
  const links = Array.from(container.querySelectorAll(".directory-card a.directory-book"), (item) =>
    item.getAttribute("href"),
  );
  expect(links).toHaveLength(2);
  for (const href of links) {
    expect(href).toMatch(/^\/booking\?practitioner=\d+$/);
  }
});
