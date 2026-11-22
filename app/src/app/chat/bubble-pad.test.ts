// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import path from "node:path";
import { designTokens } from "@steve/shared";
import { afterEach, expect, it } from "vitest";

const chatCss = readFileSync(
  path.join(process.cwd(), "app/src/app/chat/chat.css"),
  "utf8",
);

const bubbleClasses = ["chat-user", "chat-agent", "chat-error", "chat-typing"] as const;

const equalPad = "var(--space-3)";

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
});

it("declares the 12px space token on every side of each chat bubble", () => {
  expect(designTokens.space[3]).toBe("12px");
  for (const className of bubbleClasses) {
    expect(paddings(chatCss, `.${className}`)).toEqual([equalPad]);
  }
});

it("applies --space-3 on every side of a chat bubble", () => {
  const style = document.createElement("style");
  style.textContent = chatCss;
  document.head.append(style);
  document.documentElement.style.setProperty("--space-3", designTokens.space[3]);
  const host = document.createElement("div");
  document.body.append(host);
  for (const className of bubbleClasses) {
    const bubble = document.createElement("div");
    bubble.className = className;
    host.append(bubble);
    expect(sides(bubble)).toEqual(box(designTokens.space[3]));
  }
  document.documentElement.style.setProperty("--space-3", "21px");
  for (const className of bubbleClasses) {
    const bubble = host.querySelector(`.${className}`);
    if (!(bubble instanceof HTMLElement)) {
      throw new Error(`missing ${className}`);
    }
    expect(sides(bubble)).toEqual(box("21px"));
  }
});

type Box = {
  readonly top: string;
  readonly right: string;
  readonly bottom: string;
  readonly left: string;
};

function box(value: string): Box {
  return { top: value, right: value, bottom: value, left: value };
}

function sides(bubble: HTMLElement): Box {
  const computed = getComputedStyle(bubble);
  return {
    top: computed.paddingTop,
    right: computed.paddingRight,
    bottom: computed.paddingBottom,
    left: computed.paddingLeft,
  };
}

function paddings(css: string, selector: string): string[] {
  const found: string[] = [];
  for (const rule of topLevelRules(css)) {
    if (!rule.selectors.includes(selector)) {
      continue;
    }
    const match = /padding:\s*([^;]+);/.exec(rule.body);
    if (match?.[1] !== undefined) {
      found.push(match[1].trim());
    }
  }
  if (found.length === 0) {
    throw new Error(`missing padding on ${selector}`);
  }
  return found;
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
