import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designTokens } from "@steve/shared";
import { expect, it, vi } from "vitest";
import { viewport } from "./layout.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const manifestPath = path.join(
  repoRoot,
  "shared/assets/brand/site.webmanifest",
);

const pageTop = designTokens.color.indigo50;

it("pins the installed app color to the chat page top", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    theme_color: string;
    background_color: string;
  };
  expect(manifest.theme_color).toBe(pageTop);
  expect(manifest.background_color).toBe(pageTop);
  expect(viewport.themeColor).toBe(pageTop);
});
