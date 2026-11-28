// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import BookingClient from "./booking-client.js";

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

function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${text}`);
  }
  return found;
}

it("renders the confirmed booking card with practitioner details and agenda link", async () => {
  const container = await mount(createElement(BookingClient, { callDelayMs: 0 }));
  expect(container.querySelector("h1")?.textContent).toBe("Book an appointment");
  expect(container.textContent).toContain("Calling the practice");
  expect(container.textContent).toContain("Slot confirmed");
  expect(container.textContent).toContain("Appointment confirmed");
  expect(container.textContent).toContain("Camille Lunéval");
  expect(container.textContent).toContain("Wednesday 2 December · 10:00");
  expect(container.textContent).toContain("1 rue des Nuages Mauves");
  expect(container.querySelector('a[href="/agenda"]')?.textContent).toContain(
    "See in calendar",
  );
});

it("renders the in-progress calling state with the phone mascot", async () => {
  const container = await mount(
    createElement(BookingClient, { initialPhase: "calling", callDelayMs: 0 }),
  );
  expect(container.querySelector("h1")?.textContent).toBe("Calling the practice");
  expect(container.querySelector(".steve-hero-mascot")?.getAttribute("src")).toBe(
    "/mascot/state-calling.webp",
  );
  expect(container.textContent).toContain("Call in progress");
  expect(container.textContent).toContain("Waiting for confirmation");
});

it("runs the practice call and confirms the first practitioner's slot", async () => {
  const container = await mount(createElement(BookingClient, { callDelayMs: 0 }));
  await act(async () => {
    buttonByText(container, "Start the call to the practice").click();
  });
  expect(container.textContent).toContain("Appointment confirmed");
  expect(container.textContent).toContain("Wednesday 2 December · 10:00");
});

it("falls back to a second practitioner when the first practice refuses", async () => {
  const container = await mount(createElement(BookingClient, { callDelayMs: 0 }));
  await act(async () => {
    buttonByText(container, "2nd practitioner if refused").click();
  });
  await act(async () => {
    buttonByText(container, "Start the call to the practice").click();
  });
  expect(container.textContent).toContain("Appointment confirmed");
  expect(container.textContent).toContain("Noé Brumelac");
  expect(container.textContent).toContain("Wednesday 2 December · 14:00");
});

it("reports when at most 2 practices refuse without confirming a slot", async () => {
  const container = await mount(createElement(BookingClient, { callDelayMs: 0 }));
  await act(async () => {
    buttonByText(container, "No free slot").click();
  });
  await act(async () => {
    buttonByText(container, "Start the call to the practice").click();
  });
  expect(container.textContent).toContain("No slot confirmed");
  expect(container.querySelectorAll(".booking-attempt-item")).toHaveLength(2);
});
