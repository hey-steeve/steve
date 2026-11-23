import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designTokens } from "@steve/shared";
import { expect, it } from "vitest";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const chatCss = readFileSync(path.join(appDir, "src/app/chat/chat.css"), "utf8");
const homeCss = readFileSync(path.join(appDir, "src/app/globals.css"), "utf8");

const controlRadius = {
  ".chat-back": "var(--radius-md)",
  ".chat-back-face": "var(--radius-md)",
  ".chat-chip": "var(--radius-md)",
  ".chat-new-message": "var(--radius-md)",
  ".chat-plus": "var(--radius-md)",
  ".chat-action": "var(--radius-md)",
  ".chat-profile": "var(--radius-md)",
  ".chat-profile-face": "var(--radius-sm)",
  ".chat-profile-photo": "var(--radius-sm)",
  ".chat-title img": "var(--radius-md)",
  ".chat-title": "var(--radius-lg)",
  ".chat-badge": "var(--radius-sm)",
} as const;

it("keeps a shared radius scale for controls", () => {
  expect(designTokens.radius).toEqual({
    sm: "8px",
    md: "12px",
    lg: "16px",
    default: "16px",
  });
});

it("rounds buttons, chips, the back button, and the profile frame with tokens", () => {
  for (const [selector, radius] of Object.entries(controlRadius)) {
    expect(declaration(chatCss, selector, "border-radius")).toBe(radius);
  }
  expect(declaration(chatCss, ".chat-profile-photo", "border-radius")).toBe(
    declaration(chatCss, ".chat-profile-face", "border-radius"),
  );
});

it("rounds message avatars with the profile frame radius", () => {
  expect(declaration(chatCss, ".chat-avatar", "border-radius")).toBe(
    "var(--radius-sm)",
  );
  expect(declaration(chatCss, ".chat-avatar img", "border-radius")).toBe(
    "var(--radius-sm)",
  );
});

it("rejects a raw border-radius length in chat and home styles", () => {
  const offenders = [...rawBorderRadius(chatCss), ...rawBorderRadius(homeCss)];
  expect(offenders).toEqual([]);
});

function rawBorderRadius(css: string): string[] {
  const offenders: string[] = [];
  for (const match of css.matchAll(/border-radius:\s*([^;]+);/g)) {
    const value = match[1] ?? "";
    for (const part of value.trim().split(/\s+/)) {
      // 0 is the sheet's flat bottom corners. Every other length must be a radius token.
      if (/^var\(--radius-[a-z0-9-]+\)$/.test(part) || part === "0" || part === "50%") {
        continue;
      }
      offenders.push(value.trim());
      break;
    }
  }
  return offenders;
}

function declaration(css: string, selector: string, property: string): string {
  for (const rule of topLevelRules(css)) {
    if (!rule.selectors.includes(selector)) {
      continue;
    }
    const match = new RegExp(`${property}:\\s*([^;]+);`).exec(rule.body);
    if (match?.[1] !== undefined) {
      return match[1].trim();
    }
  }
  throw new Error(`missing ${property} on ${selector}`);
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
