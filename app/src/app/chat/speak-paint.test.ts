// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const globalsCss = readFileSync(
  path.join(process.cwd(), "app/src/app/globals.css"),
  "utf8",
);
const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

type Rank = readonly [number, number, number];

type PaintState = {
  readonly hover: boolean;
  readonly active: boolean;
  readonly canHover: boolean;
};

type Paint = {
  readonly background: string;
  readonly color: string;
};

const pressedBackground = "var(--color-indigo-50)";
const pressedColor = "var(--color-primary)";

it("keeps the pressed speaker colors when the pointer hovers, presses, or sticks", () => {
  const style = document.createElement("style");
  style.textContent = `${globalsCss}\n${chatCss}`;
  document.head.append(style);
  const root = document.documentElement;
  root.style.setProperty("--color-indigo-50", "#f0f3ff");
  root.style.setProperty("--color-primary", "#5c59f3");
  root.style.setProperty("--color-indigo-700", "#2f33a8");
  root.style.setProperty("--color-indigo-900", "#0c0a66");
  root.style.setProperty("--color-canvas", "#ffffff");
  const button = document.createElement("button");
  button.className = "chat-speak";
  button.type = "button";
  button.setAttribute("aria-pressed", "true");
  document.body.append(button);
  try {
    const resting = getComputedStyle(button);
    const hover = paint(button, { hover: true, active: false, canHover: true });
    const pressed = paint(button, { hover: false, active: true, canHover: true });
    const stuck = paint(button, { hover: true, active: false, canHover: false });
    const touchPress = paint(button, { hover: false, active: true, canHover: false });
    expect({
      restingBackground: resting.backgroundColor,
      restingColor: resting.color,
      hover,
      pressed,
      stuck,
      touchPress,
    }).toEqual({
      restingBackground: "#f0f3ff",
      restingColor: "#5c59f3",
      hover: { background: pressedBackground, color: pressedColor },
      pressed: { background: pressedBackground, color: pressedColor },
      stuck: { background: pressedBackground, color: pressedColor },
      touchPress: { background: pressedBackground, color: pressedColor },
    });
  } finally {
    style.remove();
    button.remove();
  }
});

it("does not treat an any-hover media query as hover", () => {
  const style = document.createElement("style");
  style.textContent = `${globalsCss}\n${chatCss}
@media (any-hover: hover) {
  .chat-speak[aria-pressed="true"]:hover {
    background: #2f33a8;
    color: #ffffff;
  }
}`;
  document.head.append(style);
  const button = document.createElement("button");
  button.className = "chat-speak";
  button.type = "button";
  button.setAttribute("aria-pressed", "true");
  document.body.append(button);
  const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    } as MediaQueryList;
  });
  try {
    expect(paint(button, { hover: true, active: false, canHover: true })).toEqual({
      background: pressedBackground,
      color: pressedColor,
    });
  } finally {
    matchMedia.mockRestore();
    style.remove();
    button.remove();
  }
});

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll("style").forEach((node) => {
    node.remove();
  });
});

function paint(button: HTMLButtonElement, state: PaintState): Paint {
  const pieces: Array<{
    order: number;
    rank: Rank;
    background: string;
    color: string;
  }> = [];
  let order = 0;
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule.type === CSSRule.MEDIA_RULE && rule instanceof CSSMediaRule) {
        const wantsHover = /(?<![\w-])hover\s*:\s*hover/.test(rule.conditionText);
        const matches = wantsHover
          ? state.canHover
          : window.matchMedia(rule.conditionText).matches;
        if (matches) {
          visit(rule.cssRules);
        }
        continue;
      }
      if (rule.type !== CSSRule.STYLE_RULE || !(rule instanceof CSSStyleRule)) {
        continue;
      }
      const rank = matchingRank(button, rule.selectorText, state);
      if (rank === null) {
        continue;
      }
      pieces.push({
        order,
        rank,
        background: declaredBackground(rule.style),
        color: rule.style.color,
      });
      order += 1;
    }
  };
  for (const sheet of document.styleSheets) {
    visit(sheet.cssRules);
  }
  let background = "";
  let color = "";
  let backgroundChoice: { rank: Rank; order: number } | null = null;
  let colorChoice: { rank: Rank; order: number } | null = null;
  for (const piece of pieces) {
    if (piece.background.length > 0 && prefer(backgroundChoice, piece)) {
      background = piece.background;
      backgroundChoice = piece;
    }
    if (piece.color.length > 0 && prefer(colorChoice, piece)) {
      color = piece.color;
      colorChoice = piece;
    }
  }
  return { background, color };
}

function declaredBackground(style: CSSStyleDeclaration): string {
  const shorthand = style.getPropertyValue("background");
  if (shorthand.length > 0) {
    return shorthand;
  }
  return style.getPropertyValue("background-color");
}

function prefer(
  current: { rank: Rank; order: number } | null,
  next: { rank: Rank; order: number },
): boolean {
  if (current === null) {
    return true;
  }
  for (let index = 0; index < current.rank.length; index += 1) {
    const left = next.rank[index] ?? 0;
    const right = current.rank[index] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  return next.order > current.order;
}

function matchingRank(
  button: HTMLButtonElement,
  selectorText: string,
  state: PaintState,
): Rank | null {
  let best: Rank | null = null;
  for (const alternative of selectorText.split(",")) {
    const selector = alternative.trim();
    if (selector.length === 0 || !alternativeMatches(button, selector, state)) {
      continue;
    }
    const rank = specificity(selector);
    if (best === null || prefer({ rank: best, order: 0 }, { rank, order: 1 })) {
      best = rank;
    }
  }
  return best;
}

function alternativeMatches(
  button: HTMLButtonElement,
  selector: string,
  state: PaintState,
): boolean {
  if (selector.includes(":hover") && !state.hover) {
    return false;
  }
  if (selector.includes(":active") && !state.active) {
    return false;
  }
  const stripped = selector.replaceAll(":hover", "").replaceAll(":active", "").trim();
  if (stripped.length === 0) {
    return false;
  }
  try {
    return button.matches(stripped);
  } catch {
    return false;
  }
}

function specificity(selector: string): Rank {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = selector.match(/\.[\w-]+/g)?.length ?? 0;
  const attributes = selector.match(/\[[^\]]+\]/g)?.length ?? 0;
  const pseudos = selector.match(/:[\w-]+(\([^)]*\))?/g)?.length ?? 0;
  const plain = selector
    .replace(/#[\w-]+/g, " ")
    .replace(/\.[\w-]+/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/:[\w-]+(\([^)]*\))?/g, " ");
  const elements = plain.split(/[^A-Za-z0-9_-]+/).filter((part) => /^[A-Za-z]/.test(part))
    .length;
  return [ids, classes + attributes + pseudos, elements];
}
