import { createHash } from "node:crypto";
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
import sharp from "sharp";
import { afterEach, expect, it } from "vitest";
import { headerAvatarSrc, heroSrc, profileHeroSrc, replyAvatarSrc, steveFace } from "./chat/faces.js";
import { mascotWebps, syncMascotWebps } from "./sync-mascot-webps.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(appDir, "../shared/assets/mascot");
const dayMs = 24 * 60 * 60 * 1000;
const temps: string[] = [];

function tempPublic(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "steve-mascot-"));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fileName(url: string): string {
  return url.slice("/mascot/".length);
}

it("registers the bubbles pose", async () => {
  const relative = "body/bubbles.png";
  const png = path.join(sourceRoot, relative);
  expect(existsSync(png)).toBe(true);
  const meta = await sharp(png).metadata();
  expect(meta.width).toBe(1137);
  expect(meta.height).toBe(840);
  expect(meta.hasAlpha).toBe(true);
  const hash = createHash("sha256").update(readFileSync(png)).digest("hex");
  const sums = readFileSync(path.join(sourceRoot, "SHA256SUMS"), "utf8");
  expect(sums.split("\n")).toContain(`${hash}  ${relative}`);
  expect(mascotWebps).toContainEqual({
    file: "bubbles.webp",
    source: relative,
    lossless: true,
  });
});

it("serves the bubbles pose at the full source size", async () => {
  const cssWidth = 284;
  const publicDir = tempPublic();
  const pngPath = path.join(sourceRoot, "body/bubbles.png");
  await syncMascotWebps({ publicDir, sourceRoot });
  const bytes = readFileSync(path.join(publicDir, "mascot", "bubbles.webp"));
  const sourceMeta = await sharp(pngPath).metadata();
  const meta = await sharp(bytes).metadata();
  const sourceWidth = sourceMeta.width ?? 0;
  const sourceHeight = sourceMeta.height ?? 0;
  const neededWidth = Math.min(sourceWidth, cssWidth * 3);
  expect(sourceWidth).toBeGreaterThanOrEqual(cssWidth * 3);
  const neededHeight = Math.min(sourceHeight, Math.ceil((cssWidth * sourceHeight) / sourceWidth * 3));
  expect({
    width: meta.width,
    height: meta.height,
    coversDpr3: (meta.width ?? 0) >= neededWidth && (meta.height ?? 0) >= neededHeight,
    lossless: bytes.subarray(12, 16).toString("ascii"),
  }).toEqual({
    width: sourceWidth,
    height: sourceHeight,
    coversDpr3: true,
    lossless: "VP8L",
  });

  const source = await sharp(pngPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(decoded.info.width).toBe(source.info.width);
  expect(decoded.info.height).toBe(source.info.height);
  let mismatches = 0;
  const pixels = source.info.width * source.info.height;
  for (let i = 0; i < pixels; i++) {
    const offset = i * 4;
    if (source.data[offset + 3] === 0) {
      continue;
    }
    if (
      source.data[offset] !== decoded.data[offset] ||
      source.data[offset + 1] !== decoded.data[offset + 1] ||
      source.data[offset + 2] !== decoded.data[offset + 2] ||
      source.data[offset + 3] !== decoded.data[offset + 3]
    ) {
      mismatches += 1;
    }
  }
  expect(mismatches).toBe(0);
});

it("writes the webps the chat UI names, and only those", async () => {
  const publicDir = tempPublic();
  const destDir = path.join(publicDir, "mascot");
  const sources = mascotWebps.map((item) => readFileSync(path.join(sourceRoot, item.source)));
  await syncMascotWebps({ publicDir, sourceRoot });
  const first = new Map(
    mascotWebps.map((item) => [item.file, readFileSync(path.join(destDir, item.file))]),
  );
  await syncMascotWebps({ publicDir, sourceRoot });

  const used = [heroSrc, profileHeroSrc, headerAvatarSrc, replyAvatarSrc, ...Object.values(steveFace)].map(
    fileName,
  );
  expect(mascotWebps.map((item) => item.file).sort()).toEqual([...new Set(used)].sort());
  expect(readdirSync(destDir).sort()).toEqual(mascotWebps.map((item) => item.file).sort());
  expect(existsSync(path.join(destDir, "celebrate.webp"))).toBe(false);
  expect(existsSync(path.join(destDir, "pfp-indigo.webp"))).toBe(false);
  expect(readdirSync(publicDir).some((name) => name.startsWith("mascot.tmp-"))).toBe(false);
  expect(publicDir.startsWith(path.join(appDir, "public"))).toBe(false);

  for (const item of mascotWebps) {
    const bytes = readFileSync(path.join(destDir, item.file));
    expect(bytes).toEqual(first.get(item.file));
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    if ("width" in item && "height" in item) {
      expect(meta.width).toBe(item.width);
      expect(meta.height).toBe(item.height);
    }
  }

  const bubbles = await sharp(path.join(destDir, "bubbles.webp")).metadata();
  expect(bubbles.width).toBe(1137);
  expect(bubbles.height).toBe(840);

  for (const [index, item] of mascotWebps.entries()) {
    const source = sources[index];
    expect(source).toBeDefined();
    expect(readFileSync(path.join(sourceRoot, item.source))).toEqual(source);
  }
});

it("keeps another run's fresh staging directory and the published folder", async () => {
  const publicDir = tempPublic();
  const destDir = path.join(publicDir, "mascot");
  await syncMascotWebps({ publicDir, sourceRoot });
  const folder = statSync(destDir).ino;
  const fresh = path.join(publicDir, "mascot.tmp-other-fresh");
  const stale = path.join(publicDir, "mascot.tmp-other-stale");
  mkdirSync(fresh);
  mkdirSync(stale);
  writeFileSync(path.join(fresh, "marker.txt"), "keep");
  writeFileSync(path.join(stale, "marker.txt"), "drop");
  const old = new Date(Date.now() - dayMs);
  utimesSync(stale, old, old);
  writeFileSync(path.join(destDir, "hello.webp"), "gone");

  await syncMascotWebps({ publicDir, sourceRoot });

  expect(statSync(destDir).ino).toBe(folder);
  expect(readFileSync(path.join(fresh, "marker.txt"), "utf8")).toBe("keep");
  expect(existsSync(stale)).toBe(false);
  expect(existsSync(path.join(destDir, "celebrate.webp"))).toBe(false);
  expect(readdirSync(destDir).sort()).toEqual(mascotWebps.map((item) => item.file).sort());
});

it("leaves a complete mascot folder when two runs overlap", async () => {
  const publicDir = tempPublic();
  const fresh = path.join(publicDir, "mascot.tmp-other-live");
  mkdirSync(fresh);
  writeFileSync(path.join(fresh, "marker.txt"), "keep");

  await Promise.all([
    syncMascotWebps({ publicDir, sourceRoot }),
    syncMascotWebps({ publicDir, sourceRoot }),
  ]);

  const destDir = path.join(publicDir, "mascot");
  expect(statSync(destDir).isDirectory()).toBe(true);
  expect(readdirSync(destDir).sort()).toEqual(mascotWebps.map((item) => item.file).sort());
  expect(readFileSync(path.join(fresh, "marker.txt"), "utf8")).toBe("keep");
  const leftovers = readdirSync(publicDir).filter((name) => name.startsWith("mascot.tmp-"));
  expect(leftovers).toEqual(["mascot.tmp-other-live"]);
});

it("throws before creating a staging directory when a mascot source is missing", async () => {
  const publicDir = tempPublic();
  const missing = path.join(publicDir, "no-source");
  mkdirSync(missing);
  await expect(syncMascotWebps({ publicDir, sourceRoot: missing })).rejects.toThrow();
  expect(readdirSync(publicDir).some((name) => name.startsWith("mascot.tmp-"))).toBe(false);
  expect(existsSync(path.join(publicDir, "mascot"))).toBe(false);
});
