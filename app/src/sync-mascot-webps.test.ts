import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { expect, it } from "vitest";
import { headerAvatarSrc, heroSrc, replyAvatarSrc, steveFace } from "./chat/faces.js";
import { mascotWebps, syncMascotWebps } from "./sync-mascot-webps.js";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(appDir, "../shared/assets/mascot");
const publicDir = path.join(appDir, "public");
const destDir = path.join(publicDir, "mascot");

function fileName(url: string): string {
  return url.slice("/mascot/".length);
}

it("writes the webps the chat UI names, and only those", async () => {
  const sources = mascotWebps.map((item) => readFileSync(path.join(sourceRoot, item.source)));
  await syncMascotWebps();
  const first = new Map(
    mascotWebps.map((item) => [item.file, readFileSync(path.join(destDir, item.file))]),
  );
  await syncMascotWebps();

  const used = [
    heroSrc,
    headerAvatarSrc,
    replyAvatarSrc,
    ...Object.values(steveFace),
  ].map(fileName);
  expect(mascotWebps.map((item) => item.file).sort()).toEqual([...new Set(used)].sort());
  expect(readdirSync(destDir).sort()).toEqual(mascotWebps.map((item) => item.file).sort());
  expect(existsSync(path.join(destDir, "hello.webp"))).toBe(false);
  expect(existsSync(path.join(destDir, "pfp-indigo.webp"))).toBe(false);
  expect(readdirSync(publicDir).some((name) => name.startsWith("mascot.tmp-"))).toBe(false);

  for (const item of mascotWebps) {
    const bytes = readFileSync(path.join(destDir, item.file));
    expect(bytes).toEqual(first.get(item.file));
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.height).toBe(item.height);
    if ("width" in item) {
      expect(meta.width).toBe(item.width);
    }
  }

  const shrug = await sharp(path.join(destDir, "shrug.webp")).metadata();
  expect(shrug.width).toBe(514);
  expect(shrug.height).toBe(640);

  for (const [index, item] of mascotWebps.entries()) {
    const source = sources[index];
    expect(source).toBeDefined();
    expect(readFileSync(path.join(sourceRoot, item.source))).toEqual(source);
  }
});
