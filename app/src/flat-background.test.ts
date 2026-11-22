import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { designTokens } from "@steve/shared";
import sharp from "sharp";
import { expect, it, vi } from "vitest";
import { headerAvatarSrc } from "./chat/faces.js";
import { mascotWebps, syncMascotWebps } from "./sync-mascot-webps.js";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "alan-sans" }),
}));

const { metadata } = await import("./app/layout.js");

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appDir, "..");
const oldLavender = [218, 196, 232] as const;
const page = rgb(designTokens.color.page);
const profile = rgb(designTokens.color.profile);

function rgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function distance(red: number, green: number, blue: number): number {
  return Math.hypot(red - oldLavender[0], green - oldLavender[1], blue - oldLavender[2]);
}

async function pixels(
  file: string | Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const decoded = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
}

function at(
  data: Buffer,
  width: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const index = (y * width + x) * 4;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, data[index + 3] ?? 0];
}

function isColor(
  pixel: readonly [number, number, number, number],
  color: readonly [number, number, number],
): boolean {
  return pixel[0] === color[0] && pixel[1] === color[1] && pixel[2] === color[2] && pixel[3] === 255;
}

function outerRing(
  data: Buffer,
  width: number,
  height: number,
  color: readonly [number, number, number],
): number[] {
  const distances: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pixel = at(data, width, x, y);
      if (!isColor(pixel, color)) continue;
      let touchesSubject = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const neighbor = at(data, width, x + dx, y + dy);
        if (neighbor[3] === 0) continue;
        if (!isColor(neighbor, color)) touchesSubject = true;
      }
      if (touchesSubject) distances.push(distance(pixel[0], pixel[1], pixel[2]));
    }
  }
  return distances;
}

function listedUrls(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value instanceof URL) return [value.toString()];
  if (Array.isArray(value)) return value.flatMap((item) => listedUrls(item));
  if (value !== null && typeof value === "object" && "url" in value) {
    return listedUrls(value.url);
  }
  return [];
}

function iconUrls(): string[] {
  const urls: string[] = [];
  const icons = metadata.icons;
  if (icons !== null && typeof icons === "object" && !Array.isArray(icons)) {
    if ("icon" in icons) urls.push(...listedUrls(icons.icon));
    if ("apple" in icons) urls.push(...listedUrls(icons.apple));
  } else {
    urls.push(...listedUrls(icons));
  }
  urls.push(...listedUrls(metadata.openGraph?.images));
  urls.push(...listedUrls(metadata.twitter?.images));
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, "shared/assets/brand/site.webmanifest"), "utf8"),
  ) as { icons: { src: string }[] };
  for (const icon of manifest.icons) urls.push(icon.src);
  return urls;
}

function icoPngs(file: string): Buffer[] {
  const bytes = readFileSync(file);
  const count = bytes.readUInt16LE(4);
  const images: Buffer[] = [];
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    images.push(bytes.subarray(offset, offset + size));
  }
  return images;
}

async function expectFlat(
  file: string | Buffer,
  color: readonly [number, number, number],
): Promise<void> {
  const image = await pixels(file);
  const ring = outerRing(image.data, image.width, image.height, color);
  expect(ring.length).toBeGreaterThan(0);
  expect(Math.min(...ring)).toBeGreaterThan(30);
  const samples = [
    at(image.data, image.width, 0, 0),
    at(image.data, image.width, image.width - 1, 0),
    at(image.data, image.width, 0, image.height - 1),
    at(image.data, image.width, image.width - 1, image.height - 1),
    at(image.data, image.width, Math.floor(image.width / 2), 0),
  ];
  const opaque = samples.filter((pixel) => pixel[3] === 255);
  expect(opaque.length).toBeGreaterThan(0);
  for (const pixel of opaque) {
    expect([pixel[0], pixel[1], pixel[2]]).toEqual([...color]);
  }
}

it("paints the header avatar on the profile token", async () => {
  expect(designTokens.color.profile).toBe("#daddfe");
  const fileName = headerAvatarSrc.slice("/mascot/".length);
  const item = mascotWebps.find((entry) => entry.file === fileName);
  expect(item?.source).toBe("avatar/pfp-lavender-profile.png");
  const png = path.join(repoRoot, "shared/assets/mascot", item?.source ?? "");
  await expectFlat(png, profile);
  const publicDir = mkdtempSync(path.join(tmpdir(), "steve-profile-"));
  try {
    await syncMascotWebps({
      publicDir,
      sourceRoot: path.join(repoRoot, "shared/assets/mascot"),
    });
    const webp = await pixels(
      readFileSync(path.join(publicDir, "mascot", "pfp-lavender-profile.webp")),
    );
    const corner = at(webp.data, webp.width, 0, 0);
    expect(Math.abs(corner[0] - profile[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(corner[1] - profile[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(corner[2] - profile[2])).toBeLessThanOrEqual(2);
  } finally {
    rmSync(publicDir, { recursive: true, force: true });
  }
  const sums = readFileSync(path.join(repoRoot, "shared/assets/mascot/SHA256SUMS"), "utf8");
  const original = readFileSync(path.join(repoRoot, "shared/assets/mascot/avatar/pfp-lavender.png"));
  const hash = createHash("sha256").update(original).digest("hex");
  expect(sums.split("\n")).toContain(`85fc28f9b160233f8851abf9a0e15f0ae9e07c356972047c0e197a85429c0570  avatar/pfp-lavender.png`);
  expect(hash).toBe("85fc28f9b160233f8851abf9a0e15f0ae9e07c356972047c0e197a85429c0570");
});

it("keeps lounge-call-page on the page token and leaves the lavender file unchanged", async () => {
  expect(designTokens.color.page).toBe("#eff1fe");
  const root = path.join(repoRoot, "shared/assets/mascot");
  await expectFlat(path.join(root, "body/lounge-call-page.png"), page);
  const original = await pixels(path.join(root, "body/lounge-call.png"));
  expect(at(original.data, original.width, 0, 0)[3]).toBe(0);
  const pageFile = await pixels(path.join(root, "body/lounge-call-page.png"));
  expect(at(pageFile.data, pageFile.width, 0, 0)[3]).toBe(255);
  const sums = readFileSync(path.join(root, "SHA256SUMS"), "utf8");
  const hash = createHash("sha256")
    .update(readFileSync(path.join(root, "body/lounge-call.png")))
    .digest("hex");
  expect(hash).toBe("5abe8fa9b655e59b5fee0981c13f37ae91ab5e1ecbb3cb26b643c0a66fe735d7");
  expect(sums.split("\n")).toContain(`${hash}  body/lounge-call.png`);
});

it("paints the icons and the share image on the page token", async () => {
  const urls = [...new Set(iconUrls())];
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    const name = url.slice("/icons/".length);
    expect(name.includes("/")).toBe(false);
    const file = path.join(repoRoot, "shared/assets/brand", name);
    if (name.endsWith(".ico")) {
      const images = icoPngs(file);
      expect(images.length).toBe(4);
      for (const image of images) {
        await expectFlat(image, page);
      }
      continue;
    }
    await expectFlat(file, page);
  }
  const original = readFileSync(path.join(repoRoot, "shared/assets/brand/icon-1024.png"));
  const hash = createHash("sha256").update(original).digest("hex");
  expect(hash).toBe("697a5e0377c6cae98e683193f29c10bcd41df37aba55b0f978afd80739d1b41b");
});
