import { copyFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "app/package.json"));
const sharp = require("sharp");

const sourceRel = "shared/assets/mascot/body/lounge-call-source-eff1fe.png";
const pageRel = "shared/assets/mascot/body/lounge-call-page.png";

function assetPath(rel) {
  const file = path.join(repo, rel);
  if (path.resolve(file) === path.resolve(repo, sourceRel) && rel !== sourceRel) {
    throw new Error(`refusing to edit ${sourceRel} in place`);
  }
  return file;
}

function pagePath() {
  const file = assetPath(pageRel);
  if (path.resolve(file) === path.resolve(repo, sourceRel)) {
    throw new Error(`refusing to edit ${sourceRel} in place`);
  }
  return file;
}

async function meta(file) {
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`missing size ${file}`);
  return {
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true,
  };
}

async function rgba(file) {
  const decoded = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decoded.data;
}

function maxDelta(actual, expected) {
  if (actual.length !== expected.length) return Number.POSITIVE_INFINITY;
  let max = 0;
  for (let index = 0; index < actual.length; index++) {
    const delta = Math.abs(actual[index] - expected[index]);
    if (delta > max) max = delta;
  }
  return max;
}

function transparentCount(data) {
  let count = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) count++;
  }
  return count;
}

async function expectedPixels(width, height) {
  const source = assetPath(sourceRel);
  const sourceMeta = await meta(source);
  if (sourceMeta.width === width && sourceMeta.height === height) {
    return { data: await rgba(source), mode: "copy" };
  }
  const data = await sharp(source)
    .resize(width, height, { kernel: "lanczos3", fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return { data, mode: "lanczos3" };
}

const checkOnly = process.argv.includes("--check");

if (!checkOnly) {
  const source = assetPath(sourceRel);
  const dest = pagePath();
  const sourceMeta = await meta(source);
  const pageMeta = await meta(dest);
  if (sourceMeta.width === pageMeta.width && sourceMeta.height === pageMeta.height) {
    copyFileSync(source, dest);
  } else {
    await sharp(source)
      .resize(pageMeta.width, pageMeta.height, { kernel: "lanczos3", fit: "fill" })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(dest);
  }
}

const dest = pagePath();
const pageMeta = await meta(dest);
const expected = await expectedPixels(pageMeta.width, pageMeta.height);
const actual = await rgba(dest);
const delta = maxDelta(actual, expected.data);
const transparent = transparentCount(actual);
let failed = 0;
if (delta > 0) failed++;
if (transparent > 0 || pageMeta.hasAlpha) failed++;
if (expected.mode === "copy" && !readFileSync(assetPath(sourceRel)).equals(readFileSync(dest))) {
  process.stdout.write(`${path.basename(pageRel)} bytes\n`);
  failed++;
}
const alpha = pageMeta.hasAlpha || transparent > 0 ? "alpha" : "alpha none";
process.stdout.write(
  `${path.basename(pageRel)} max ${Number.isFinite(delta) ? delta : "inf"} ${alpha} ${expected.mode} transparent ${transparent}\n`,
);
if (failed > 0) process.exitCode = 1;
