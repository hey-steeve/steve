import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { mascotAppIcons, syncMascotAppIcons } from "./sync-mascot-app-icons.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..");
const sourceRoot = path.join(repoRoot, "shared/assets/mascot");
const sourceManifest = path.join(repoRoot, "shared/assets/brand/site.webmanifest");
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("creates rounded Stevie favicons and matching install icons", async () => {
  const publicDir = mkdtempSync(path.join(tmpdir(), "steve-app-icons-"));
  temps.push(publicDir);
  mkdirSync(path.join(publicDir, "icons"));
  writeFileSync(
    path.join(publicDir, "icons", "site.webmanifest"),
    readFileSync(sourceManifest),
  );

  await syncMascotAppIcons({ publicDir, sourceRoot });

  const output = path.join(publicDir, "app-icons");
  expect(readdirSync(output).sort()).toEqual(
    mascotAppIcons.map((icon) => icon.file).sort(),
  );
  const favicon = await sharp(path.join(output, "favicon-32.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(favicon.info.width).toBe(32);
  expect(favicon.info.height).toBe(32);
  expect(favicon.data[3]).toBe(0);
  expect(favicon.data[(16 * 32 + 16) * 4 + 3]).toBe(255);

  const maskable = await sharp(path.join(output, "app-maskable-512.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(maskable.info.width).toBe(512);
  expect(maskable.info.height).toBe(512);
  expect([...maskable.data.subarray(0, 4)]).toEqual([218, 221, 254, 255]);

  const icons = readManifestIcons(path.join(publicDir, "icons", "site.webmanifest"));
  expect(icons.map((icon) => icon.src)).toEqual([
    "/app-icons/app-192.png",
    "/app-icons/app-512.png",
    "/app-icons/app-maskable-512.png",
  ]);
  expect(icons[2]?.purpose).toBe("maskable");
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifestIcons(file: string): { src: string; purpose?: string }[] {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed["icons"])) {
    throw new Error(`Invalid icon manifest: ${file}`);
  }
  const icons: { src: string; purpose?: string }[] = [];
  for (const item of parsed["icons"]) {
    if (!isRecord(item) || typeof item["src"] !== "string") {
      throw new Error(`Invalid icon manifest: ${file}`);
    }
    const purpose = item["purpose"];
    if (typeof purpose === "string") {
      icons.push({ src: item["src"], purpose });
      continue;
    }
    if (purpose !== undefined) {
      throw new Error(`Invalid icon manifest: ${file}`);
    }
    icons.push({ src: item["src"] });
  }
  return icons;
}
