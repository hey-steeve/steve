import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { syncBrandIcons } from "./sync-brand-icons.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.resolve(appDir, "../shared/assets/brand");
const publicDir = path.join(appDir, "public");
const destDir = path.join(publicDir, "icons");
const unpublished = new Set(["README.md", "SHA256SUMS"]);

it("serves brand files from public/icons, including every manifest icon", () => {
  syncBrandIcons();
  syncBrandIcons();

  const expected = readdirSync(sourceDir)
    .filter((name) => !unpublished.has(name))
    .sort();
  expect(readdirSync(destDir).sort()).toEqual(expected);
  for (const name of expected) {
    expect(readFileSync(path.join(destDir, name))).toEqual(
      readFileSync(path.join(sourceDir, name)),
    );
  }
  expect(existsSync(path.join(destDir, "README.md"))).toBe(false);
  expect(existsSync(path.join(destDir, "SHA256SUMS"))).toBe(false);
  expect(readdirSync(publicDir).some((name) => name.startsWith("icons.tmp-"))).toBe(
    false,
  );

  const manifest = JSON.parse(
    readFileSync(path.join(destDir, "site.webmanifest"), "utf8"),
  ) as { icons: { src: string }[] };
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith("/icons/")).toBe(true);
    const name = icon.src.slice("/icons/".length);
    expect(name.includes("/")).toBe(false);
    expect(readFileSync(path.join(destDir, name))).toEqual(
      readFileSync(path.join(sourceDir, name)),
    );
  }
});
