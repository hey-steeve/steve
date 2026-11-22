// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import ChatPage from "./chat-page.js";

const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

const greetingWidth = {
  bonjour: 84.0625,
  peter: 144.765625,
  maximilien: 202.21875,
} as const;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("places the profile on the left and centres the greeting on the viewport", () => {
  const home = rule(chatCss, ".chat-header-home");
  const greeting = rule(chatCss, ".chat-greeting");
  const profile = rule(chatCss, ".chat-header-home .chat-profile");
  const page = rule(chatCss, ".chat-page");
  expect(home).toContain("position: relative;");
  expect(profile).toContain("grid-column: 1;");
  expect(profile).toContain("justify-self: start;");
  expect(greeting).toContain("position: absolute;");
  expect(greeting).toContain("left: 50%;");
  expect(greeting).toContain("translate: -50% 0;");
  expect(greeting).toContain("font-size: 22px;");
  expect(greeting).toContain("font-weight: var(--font-weight-heading);");
  expect(rule(chatCss, ".chat-back")).toContain("grid-column: 1;");
  expect(rule(chatCss, ".chat-title")).toContain("grid-column: 2;");
  expect(rule(chatCss, ".chat-header-spacer")).toContain("grid-column: 3;");
  expect(rule(chatCss, ".chat-header")).toContain(
    "grid-template-columns: var(--hit-min) minmax(0, 1fr) var(--hit-min);",
  );

  const padLeft = px(home, "padding-left");
  const padRight = px(home, "padding-right");
  const hit = px(page, "--hit-min");
  const reserved = maxWidthReserve(greeting);
  expect(reserved.padLeft).toBe(padLeft);
  expect(hit).toBe(44);

  for (const viewportWidth of [390, 320]) {
    for (const titleWidth of [
      greetingWidth.bonjour,
      greetingWidth.peter,
      greetingWidth.maximilien,
    ]) {
      const frame = homeHeaderFrame({
        viewportWidth,
        padLeft,
        hit,
        titleGap: reserved.gap,
        titleWidth,
      });
      expect(frame.titleCenter).toBe(frame.viewportCenter);
      expect(frame.iconX).toBe(padLeft);
      expect(frame.iconRight).toBeLessThan(frame.viewportCenter);
      expect(frame.overlaps).toBe(false);
      expect(frame.clips).toBe(false);
    }
  }
  expect(padRight).toBe(padLeft);
});

it("reads the first name from the page seam and keeps Bonjour, without one", async () => {
  const empty = await mount();
  expect(empty.container.querySelector(".chat-greeting")?.textContent).toBe("Bonjour,");
  expect(
    empty.container.querySelector(".chat-header-home .chat-profile")?.getAttribute(
      "aria-label",
    ),
  ).toBe("Profil");

  const named = await mount(createElement(ChatPage, { patientFirstName: "Maximilien" }));
  expect(named.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour Maximilien,",
  );
  expect(named.container.querySelector('[aria-label="Retour"]')).toBeNull();
  const peter = await mount(createElement(ChatPage, { patientFirstName: "Peter" }));
  expect(peter.container.querySelector(".chat-greeting")?.textContent).toBe(
    "Bonjour Peter,",
  );
});

function homeHeaderFrame(input: {
  readonly viewportWidth: number;
  readonly padLeft: number;
  readonly hit: number;
  readonly titleGap: number;
  readonly titleWidth: number;
}): {
  readonly iconX: number;
  readonly iconRight: number;
  readonly titleCenter: number;
  readonly viewportCenter: number;
  readonly titleLeft: number;
  readonly maxTitle: number;
  readonly overlaps: boolean;
  readonly clips: boolean;
} {
  const iconX = input.padLeft;
  const iconRight = iconX + input.hit;
  const viewportCenter = input.viewportWidth / 2;
  const titleCenter = viewportCenter;
  const maxTitle = input.viewportWidth - 2 * (input.padLeft + input.hit + input.titleGap);
  const titleLeft = titleCenter - input.titleWidth / 2;
  return {
    iconX,
    iconRight,
    titleCenter,
    viewportCenter,
    titleLeft,
    maxTitle,
    overlaps: titleLeft < iconRight,
    clips: input.titleWidth > maxTitle,
  };
}

function maxWidthReserve(greeting: string): { readonly padLeft: number; readonly gap: number } {
  const match =
    /max-width:\s*calc\(100% - 2 \* \((\d+)px \+ var\(--hit-min\) \+ (\d+)px\)\);/.exec(
      greeting,
    );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error("missing centred greeting max-width");
  }
  return { padLeft: Number(match[1]), gap: Number(match[2]) };
}

function rule(css: string, selector: string): string {
  const token = `${selector} {`;
  const start = css.indexOf(token);
  if (start < 0) {
    throw new Error(`missing ${selector}`);
  }
  const end = css.indexOf("}", start);
  if (end < 0) {
    throw new Error(`unclosed ${selector}`);
  }
  return css.slice(start + token.length, end);
}

function px(block: string, property: string): number {
  const match = new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(block);
  if (match === null || match[1] === undefined) {
    throw new Error(`missing ${property}`);
  }
  return Number(match[1]);
}

async function mount(
  node: ReturnType<typeof createElement> = createElement(ChatPage),
): Promise<{ container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return { container };
}

const roots: Root[] = [];
