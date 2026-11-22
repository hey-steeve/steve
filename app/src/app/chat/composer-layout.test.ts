// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { designTokens } from "@steve/shared";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import RootLayout from "../layout.js";
import ChatPage from "./chat-page.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

it("keeps attach and mic as siblings outside the bordered field", async () => {
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
    expectOutside(view.container.querySelector(".chat-sheet .chat-composer"));
    const chip = view.container.querySelector(".chat-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });
    expectOutside(
      view.container.querySelector(".chat-column > .chat-dock .chat-composer"),
    );
  } finally {
    style.remove();
    document.documentElement.removeAttribute("style");
  }
});

it("matches the home field text inset to the chat field", async () => {
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
    const homeField = view.container.querySelector(".chat-sheet .chat-field");
    if (!(homeField instanceof HTMLTextAreaElement)) {
      throw new Error("missing home field");
    }
    const homeInset = textInset(homeField);
    const chip = view.container.querySelector(".chat-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("missing suggestion");
    }
    await act(async () => {
      chip.click();
    });
    const chatField = view.container.querySelector(
      ".chat-column > .chat-dock .chat-field",
    );
    if (!(chatField instanceof HTMLTextAreaElement)) {
      throw new Error("missing chat field");
    }
    expect(homeInset).toEqual(textInset(chatField));
  } finally {
    style.remove();
    document.documentElement.removeAttribute("style");
  }
});

it("rounds the composer field with the large radius token", () => {
  expect(declaration(chatCss, ".chat-field", "border-radius")).toBe(
    "var(--radius-lg)",
  );
  expect(designTokens.radius.lg).toBe("16px");
});

it("keeps the composer controls from overlapping at 320", () => {
  for (const place of ["home", "chat"] as const) {
    const frame = composerFrame({
      css: chatCss,
      viewport: 320,
      place,
    });
    expect(frame.overlaps).toBe(false);
    expect(frame.overflows).toBe(false);
    expect(frame.plus.right).toBeLessThanOrEqual(frame.field.left);
    expect(frame.field.right).toBeLessThanOrEqual(frame.action.left);
    expect(frame.field.right).toBeGreaterThan(frame.field.left);
    expect(centerY(frame.plus)).toBe(centerY(frame.field));
    expect(centerY(frame.action)).toBe(centerY(frame.field));
  }
});

function textInset(field: HTMLElement): {
  readonly paddingLeft: number;
  readonly borderLeft: number;
  readonly indent: number;
  readonly inset: number;
} {
  const style = getComputedStyle(field);
  const paddingLeft = side(style.paddingLeft);
  const borderLeft = side(style.borderLeftWidth);
  const indent = side(style.textIndent);
  return {
    paddingLeft,
    borderLeft,
    indent,
    inset: paddingLeft + borderLeft + indent,
  };
}

function side(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`not a length: ${value}`);
  }
  return parsed;
}

function expectOutside(composer: Element | null): void {
  if (!(composer instanceof HTMLElement)) {
    throw new Error("missing composer");
  }
  const plus = composer.querySelector(".chat-plus");
  const field = composer.querySelector(".chat-field");
  const action = composer.querySelector(".chat-action");
  if (
    !(plus instanceof HTMLElement) ||
    !(field instanceof HTMLTextAreaElement) ||
    !(action instanceof HTMLElement)
  ) {
    throw new Error("missing composer controls");
  }
  const order = [...composer.children];
  expect(order.indexOf(plus)).toBeLessThan(order.indexOf(field));
  expect(order.indexOf(field)).toBeLessThan(order.indexOf(action));
  expect(plus.parentElement).toBe(field.parentElement);
  expect(action.parentElement).toBe(field.parentElement);
  expect(field.contains(plus)).toBe(false);
  expect(field.contains(action)).toBe(false);
  expect(borderedControl(composer)).toBe(field);
  expect(plus.getAttribute("aria-label")).toBe("Ajouter une pièce jointe");
  expect(action.getAttribute("aria-label")).toBe("Dicter un message");
  expect(field.placeholder).toBe("Demande n'importe quoi");
  const painted = getComputedStyle(field);
  expect(painted.borderTopWidth).toBe("1px");
  expect(painted.borderRadius).toBe(designTokens.radius.lg);
  expect(channels(painted.borderTopColor)).toBe(channels(designTokens.color.border));
  expect(channels(painted.backgroundColor)).toBe(channels(designTokens.color.canvas));
  expect(channels(getComputedStyle(composer).backgroundColor)).not.toBe(
    channels(designTokens.color.canvas),
  );
}

function borderedControl(composer: HTMLElement): HTMLElement | null {
  const nodes = [composer, ...composer.querySelectorAll("*")];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const style = getComputedStyle(node);
    const width = Number.parseFloat(style.borderTopWidth);
    if (width >= 1 && style.borderRadius !== "0px") {
      return node;
    }
  }
  return null;
}

type Rect = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

function composerFrame(input: {
  readonly css: string;
  readonly viewport: number;
  readonly place: "home" | "chat";
}): {
  readonly plus: Rect;
  readonly field: Rect;
  readonly action: Rect;
  readonly overlaps: boolean;
  readonly overflows: boolean;
} {
  const tokens = pageTokens(input.css);
  const row = rowBox(input.css, tokens, input.viewport, input.place);
  const plusSize = controlSize(input.css, tokens, input.place, "plus");
  const actionSize = controlSize(input.css, tokens, input.place, "action");
  const fieldHeight = controlSize(input.css, tokens, input.place, "field").height;
  const padding = horizontal(
    declaration(input.css, ".chat-composer", "padding"),
    tokens,
  );
  const gap = resolve(declaration(input.css, ".chat-composer", "gap"), tokens);
  const align = declaration(input.css, ".chat-composer", "align-items");
  const innerLeft = row.left + padding.left;
  const innerWidth = row.width - padding.left - padding.right;
  const fieldWidth = innerWidth - plusSize.width - actionSize.width - gap * 2;
  const rowHeight = Math.max(plusSize.height, actionSize.height, fieldHeight);
  const plus = rect(innerLeft, plusSize.width, plusSize.height, rowHeight, align);
  const actionLeft = innerLeft + plusSize.width + gap + Math.max(fieldWidth, 0) + gap;
  const action = rect(actionLeft, actionSize.width, actionSize.height, rowHeight, align);
  const between = rect(
    plus.right + gap,
    fieldWidth,
    fieldHeight,
    rowHeight,
    align,
  );
  const field = paints(input.css, ".chat-composer")
    ? rect(row.left, row.width, rowHeight, rowHeight, "flex-start")
    : between;
  const boxes = [plus, field, action];
  return {
    plus,
    field,
    action,
    overlaps: intersects(plus, field) || intersects(field, action) || intersects(plus, action),
    overflows: boxes.some(
      (box) => box.left < 0 || box.right > input.viewport || box.right <= box.left,
    ),
  };
}

function paints(css: string, selector: string): boolean {
  const radius = optionalDeclaration(css, selector, "border-radius");
  const background = optionalDeclaration(css, selector, "background");
  const shadow = optionalDeclaration(css, selector, "box-shadow");
  const border = optionalDeclaration(css, selector, "border");
  return (
    (radius !== null && radius !== "0") ||
    (background !== null && background !== "transparent" && background !== "none") ||
    (shadow !== null && shadow !== "none") ||
    (border !== null && border !== "0" && border !== "none")
  );
}

function rowBox(
  css: string,
  tokens: ReadonlyMap<string, number>,
  viewport: number,
  place: "home" | "chat",
): { readonly left: number; readonly width: number } {
  if (place === "home") {
    const pad = horizontal(declaration(css, ".chat-sheet", "padding"), tokens);
    const dock = horizontal(declaration(css, ".chat-hero .chat-dock", "padding"), tokens);
    const left = resolve(declaration(css, ".chat-sheet", "margin-left"), tokens) + pad.left + dock.left;
    const right =
      resolve(declaration(css, ".chat-sheet", "margin-right"), tokens) + pad.right + dock.right;
    return { left, width: viewport - left - right };
  }
  const dock = horizontal(declaration(css, ".chat-dock", "padding"), tokens);
  return { left: dock.left, width: viewport - dock.left - dock.right };
}

function controlSize(
  css: string,
  tokens: ReadonlyMap<string, number>,
  place: "home" | "chat",
  which: "plus" | "action" | "field",
): { readonly width: number; readonly height: number } {
  if (place === "home" && which === "field") {
    const height = resolve(declaration(css, ".chat-sheet .chat-field", "min-height"), tokens);
    return { width: 0, height };
  }
  if (place === "chat" && which === "field") {
    const height = resolve(declaration(css, ".chat-field", "min-height"), tokens);
    return { width: 0, height };
  }
  if (place === "home") {
    const selector = which === "plus" ? ".chat-sheet .chat-plus" : ".chat-sheet .chat-action";
    return {
      width: resolve(declaration(css, selector, "width"), tokens),
      height: resolve(declaration(css, selector, "height"), tokens),
    };
  }
  const selector = which === "plus" ? ".chat-plus" : ".chat-action";
  return {
    width: resolve(declaration(css, selector, "width"), tokens),
    height: resolve(declaration(css, selector, "height"), tokens),
  };
}

function rect(
  left: number,
  width: number,
  height: number,
  rowHeight: number,
  align: string,
): Rect {
  const top =
    align === "center"
      ? (rowHeight - height) / 2
      : align === "flex-end"
        ? rowHeight - height
        : 0;
  return { left, right: left + width, top, bottom: top + height };
}

function centerY(box: Rect): number {
  return (box.top + box.bottom) / 2;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function pageTokens(css: string): Map<string, number> {
  const tokens = new Map<string, number>();
  const body = ruleBody(css, ".chat-page");
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*(\d+(?:\.\d+)?)px/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) {
      continue;
    }
    tokens.set(name, Number(value));
  }
  return tokens;
}

function horizontal(
  value: string,
  tokens: ReadonlyMap<string, number>,
): { readonly left: number; readonly right: number } {
  const parts = paddingParts(value);
  const at = (index: number): number => {
    const part = parts[index];
    if (part === undefined) {
      throw new Error(`missing padding ${value}`);
    }
    return resolve(part, tokens);
  };
  if (parts.length === 1) {
    const side = at(0);
    return { left: side, right: side };
  }
  if (parts.length === 2 || parts.length === 3) {
    const side = at(1);
    return { left: side, right: side };
  }
  return { left: at(3), right: at(1) };
}

function paddingParts(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of value.trim()) {
    if (char === "(") {
      depth += 1;
    }
    if (char === ")") {
      depth -= 1;
    }
    if (/\s/.test(char) && depth === 0) {
      if (current !== "") {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current !== "") {
    parts.push(current);
  }
  return parts;
}

function resolve(value: string, tokens: ReadonlyMap<string, number>): number {
  const trimmed = value.trim();
  if (trimmed === "0") {
    return 0;
  }
  const length = /^(\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (length?.[1] !== undefined) {
    return Number(length[1]);
  }
  const variable = /^var\((--[a-z0-9-]+)\)$/.exec(trimmed);
  if (variable?.[1] !== undefined) {
    const found = tokens.get(variable[1]);
    if (found === undefined) {
      throw new Error(`missing ${variable[1]}`);
    }
    return found;
  }
  throw new Error(`unresolved ${value}`);
}

function declaration(css: string, selector: string, property: string): string {
  const value = optionalDeclaration(css, selector, property);
  if (value === null) {
    throw new Error(`missing ${property} on ${selector}`);
  }
  return value;
}

function optionalDeclaration(css: string, selector: string, property: string): string | null {
  let found: string | null = null;
  for (const rule of topLevelRules(css)) {
    if (!rule.selectors.includes(selector)) {
      continue;
    }
    const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(`;${rule.body}`);
    if (match?.[1] !== undefined) {
      found = match[1].trim();
    }
  }
  return found;
}

function ruleBody(css: string, selector: string): string {
  for (const rule of topLevelRules(css)) {
    if (rule.selectors.includes(selector)) {
      return rule.body;
    }
  }
  throw new Error(`missing ${selector}`);
}

function topLevelRules(css: string): { selectors: string[]; body: string }[] {
  const rules: { selectors: string[]; body: string }[] = [];
  let depth = 0;
  let cursor = 0;
  let bodyStart = -1;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") {
      if (depth === 0) {
        bodyStart = index + 1;
      }
      depth += 1;
      continue;
    }
    if (char !== "}" || depth === 0) {
      continue;
    }
    depth -= 1;
    if (depth === 0 && bodyStart >= 0) {
      const selector = css.slice(cursor, bodyStart - 1);
      rules.push({
        selectors: selector.split(",").map((part) => part.trim()),
        body: css.slice(bodyStart, index),
      });
      cursor = index + 1;
      bodyStart = -1;
    }
  }
  return rules;
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
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/.exec(
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

async function mount(
  node: ReturnType<typeof createElement>,
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
