import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "app/package.json"));
const sharp = require("sharp");
const brand = path.join(root, "shared/assets/brand");
const page = [239, 241, 254] as const;
const sourceHash = "db07a2183ced7cd503b7b96d55c21b087a60e16555249a4bd0fa99b65976ba5f";

function readIco(bytes: Buffer): Buffer[] {
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

async function rgba(
  file: string | Buffer,
): Promise<{ data: Buffer; width: number; height: number; hasAlpha: boolean }> {
  const meta = await sharp(file).metadata();
  const decoded = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    hasAlpha: meta.hasAlpha === true,
  };
}

function at(data: Buffer, width: number, x: number, y: number): readonly number[] {
  const index = (y * width + x) * 4;
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0, data[index + 3] ?? 0];
}

it("resizes page icons from icon-source-eff1fe.png and checks the mask", async () => {
  const result = spawnSync(process.execPath, ["tooling/brand-page.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  const output = result.stdout ?? "";
  const lines = output.split("\n").filter((line) => line.includes(" max "));
  expect(result.status, output || result.stderr || "").toBe(0);
  expect(lines).toHaveLength(11);
  for (const line of lines) {
    const match = /max (\d+)/.exec(line);
    expect(match?.[1]).toBeDefined();
    expect(Number(match?.[1])).toBeLessThanOrEqual(1);
  }
  expect(output).toContain("icon-maskable-512-page.png max ");
  expect(output).toContain("margin 100");
  expect(output).toContain("favicon-32-page.png max ");
  expect(output).toContain("mask rounded");
  expect(output).toContain("apple-touch-icon-page.png max ");
  expect(output).toContain("alpha none");

  const icon = await rgba(path.join(brand, "icon-512-page.png"));
  const maskable = await rgba(path.join(brand, "icon-maskable-512-page.png"));
  expect(icon.width).toBe(512);
  expect(maskable.width).toBe(512);
  expect(at(maskable.data, 512, 80, 150)).toEqual([...page, 255]);
  expect(at(icon.data, 512, 80, 150)).not.toEqual([...page, 255]);

  const apple = await rgba(path.join(brand, "apple-touch-icon-page.png"));
  expect(apple.hasAlpha).toBe(false);
  expect(apple.width).toBe(180);

  const favicon = await rgba(path.join(brand, "favicon-32-page.png"));
  expect(at(favicon.data, 32, 0, 0)[3]).toBe(0);
  expect(at(favicon.data, 32, 8, 0)[3]).toBe(255);
  expect(at(favicon.data, 32, 16, 16)[3]).toBe(255);
  let partial = 0;
  for (let index = 3; index < favicon.data.length; index += 4) {
    const alpha = favicon.data[index] ?? 0;
    if (alpha > 0 && alpha < 255) partial++;
  }
  expect(partial).toBeGreaterThan(0);

  const frames = readIco(readFileSync(path.join(brand, "favicon-page.ico")));
  expect(frames).toHaveLength(4);
  const widths: number[] = [];
  for (const frame of frames) {
    const image = await rgba(frame);
    widths.push(image.width);
    expect(at(image.data, image.width, 0, 0)[3]).toBe(0);
    expect(at(image.data, image.width, Math.floor(image.width / 2), 0)[3]).toBe(255);
  }
  expect(widths).toEqual([16, 32, 48, 64]);
});

it("keeps the approved icon source bytes", () => {
  const source = path.join(brand, "icon-source-eff1fe.png");
  const hash = createHash("sha256").update(readFileSync(source)).digest("hex");
  expect(hash).toBe(sourceHash);
  const sums = readFileSync(path.join(brand, "SHA256SUMS"), "utf8");
  expect(sums.split("\n")).toContain(`${sourceHash}  icon-source-eff1fe.png`);
});
