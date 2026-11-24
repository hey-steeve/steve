import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { syncBrandIcons } from "./sync-brand-icons.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.resolve(appDir, "../shared/assets/brand");
const unpublished = new Set(["README.md", "SHA256SUMS"]);
const dayMs = 24 * 60 * 60 * 1000;
const temps: string[] = [];

function tempPublic(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "steve-icons-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("serves brand files from public/icons, including every manifest icon", () => {
  const publicDir = tempPublic();
  const destDir = path.join(publicDir, "icons");
  syncBrandIcons({ publicDir, sourceDir });
  syncBrandIcons({ publicDir, sourceDir });

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
  expect(publicDir.startsWith(path.join(appDir, "public"))).toBe(false);

  for (const src of readIconSrcs(path.join(destDir, "site.webmanifest"))) {
    expect(src.startsWith("/icons/")).toBe(true);
    const name = src.slice("/icons/".length);
    expect(name.includes("/")).toBe(false);
    expect(readFileSync(path.join(destDir, name))).toEqual(
      readFileSync(path.join(sourceDir, name)),
    );
  }
});

it("keeps another run's fresh icon staging directory and the published folder", () => {
  const publicDir = tempPublic();
  const destDir = path.join(publicDir, "icons");
  syncBrandIcons({ publicDir, sourceDir });
  const folder = statSync(destDir).ino;
  const fresh = path.join(publicDir, "icons.tmp-other-fresh");
  const stale = path.join(publicDir, "icons.tmp-other-stale");
  mkdirSync(fresh);
  mkdirSync(stale);
  writeFileSync(path.join(fresh, "marker.txt"), "keep");
  writeFileSync(path.join(stale, "marker.txt"), "drop");
  const old = new Date(Date.now() - dayMs);
  utimesSync(stale, old, old);
  writeFileSync(path.join(destDir, "extra.txt"), "gone");

  syncBrandIcons({ publicDir, sourceDir });

  expect(statSync(destDir).ino).toBe(folder);
  expect(readFileSync(path.join(fresh, "marker.txt"), "utf8")).toBe("keep");
  expect(existsSync(stale)).toBe(false);
  expect(existsSync(path.join(destDir, "extra.txt"))).toBe(false);
});

it("throws when the brand source is missing and leaves no staging directory", () => {
  const publicDir = tempPublic();
  expect(() =>
    syncBrandIcons({ publicDir, sourceDir: path.join(publicDir, "missing") }),
  ).toThrow();
  expect(readdirSync(publicDir).some((name) => name.startsWith("icons.tmp-"))).toBe(
    false,
  );
  expect(existsSync(path.join(publicDir, "icons"))).toBe(false);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIconSrcs(file: string): string[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed["icons"])) {
    throw new Error(`Invalid icon manifest: ${file}`);
  }
  const srcs: string[] = [];
  for (const item of parsed["icons"]) {
    if (!isRecord(item) || typeof item["src"] !== "string") {
      throw new Error(`Invalid icon manifest: ${file}`);
    }
    srcs.push(item["src"]);
  }
  return srcs;
}
