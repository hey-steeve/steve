import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "app/package.json"));
const sharp = require("sharp");

const sourceRel = "shared/assets/brand/icon-source-eff1fe.png";
const page = [239, 241, 254];
const cornerRadius = 7 / 32;
const maskSamples = 8;

const pngJobs = [
  { name: "icon-1024-page.png", size: 1024, alpha: "keep" },
  { name: "icon-512-page.png", size: 512, alpha: "keep" },
  { name: "icon-192-page.png", size: 192, alpha: "keep" },
  { name: "icon-maskable-512-page.png", size: 512, alpha: "keep", margin: 100 },
  { name: "apple-touch-icon-page.png", size: 180, alpha: "none" },
  { name: "favicon-32-page.png", size: 32, alpha: "rounded" },
  { name: "favicon-16-page.png", size: 16, alpha: "rounded" },
];

const icoName = "favicon-page.ico";
const icoSizes = [16, 32, 48, 64];

function brandPath(name) {
  const file = path.join(repo, "shared/assets/brand", name);
  if (path.resolve(file) === path.resolve(repo, sourceRel)) {
    throw new Error(`refusing to edit ${sourceRel} in place`);
  }
  return file;
}

function insideRoundedRect(px, py, size, radius) {
  if (px < 0 || py < 0 || px > size || py > size) return false;
  const inLeft = px < radius;
  const inRight = px > size - radius;
  const inTop = py < radius;
  const inBottom = py > size - radius;
  if (!(inLeft || inRight) || !(inTop || inBottom)) return true;
  const cx = inLeft ? radius : size - radius;
  const cy = inTop ? radius : size - radius;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function maskAlpha(x, y, size) {
  const radius = size * cornerRadius;
  let inside = 0;
  const total = maskSamples * maskSamples;
  for (let sy = 0; sy < maskSamples; sy++) {
    for (let sx = 0; sx < maskSamples; sx++) {
      const px = x + (sx + 0.5) / maskSamples;
      const py = y + (sy + 0.5) / maskSamples;
      if (insideRoundedRect(px, py, size, radius)) inside++;
    }
  }
  return Math.round((inside / total) * 255);
}

async function resized(size) {
  return sharp(path.join(repo, sourceRel))
    .resize(size, size, { kernel: "lanczos3", fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

async function renderSquare(job) {
  const margin = job.margin ?? 0;
  const { size } = job;
  if (margin === 0) {
    const data = Buffer.from(await resized(size));
    if (job.alpha === "rounded") {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          data[(y * size + x) * 4 + 3] = maskAlpha(x, y, size);
        }
      }
    }
    return data;
  }
  const inner = size - margin * 2;
  if (inner <= 0) throw new Error(`margin ${margin} does not fit in ${size}`);
  const placed = await resized(inner);
  const data = Buffer.alloc(size * size * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = page[0];
    data[index + 1] = page[1];
    data[index + 2] = page[2];
    data[index + 3] = 255;
  }
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const from = (y * inner + x) * 4;
      const to = ((y + margin) * size + (x + margin)) * 4;
      data[to] = placed[from];
      data[to + 1] = placed[from + 1];
      data[to + 2] = placed[from + 2];
      data[to + 3] = 255;
    }
  }
  return data;
}

function encode(data, size, alpha) {
  let image = sharp(data, { raw: { width: size, height: size, channels: 4 } });
  if (alpha === "none") image = image.removeAlpha();
  return image.png({ compressionLevel: 9 }).toBuffer();
}

function readIco(bytes) {
  const count = bytes.readUInt16LE(4);
  const images = [];
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    images.push(bytes.subarray(offset, offset + size));
  }
  return images;
}

function writeIco(pngs) {
  const count = pngs.length;
  let offset = 6 + count * 16;
  const header = Buffer.alloc(offset);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const parts = [header];
  pngs.forEach((png, index) => {
    const entry = 6 + index * 16;
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    header[entry] = width >= 256 ? 0 : width;
    header[entry + 1] = height >= 256 ? 0 : height;
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    parts.push(png);
    offset += png.length;
  });
  return Buffer.concat(parts);
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

function isPage(data, size, x, y) {
  const index = (y * size + x) * 4;
  return (
    data[index] === page[0] &&
    data[index + 1] === page[1] &&
    data[index + 2] === page[2] &&
    data[index + 3] === 255
  );
}

function maskFailure(data, size, alpha, margin) {
  if (alpha === "rounded") {
    const corner = data[3];
    const edge = data[Math.floor(size / 2) * 4 + 3];
    let partial = 0;
    let alphaMiss = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const got = data[(y * size + x) * 4 + 3];
        if (Math.abs(got - maskAlpha(x, y, size)) > 1) alphaMiss++;
        if (got > 0 && got < 255) partial++;
      }
    }
    if (corner !== 0 || edge !== 255 || partial === 0 || alphaMiss > 0) return "mask";
    return "";
  }
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) return "alpha";
  }
  if (margin > 0 && !isPage(data, size, margin - 1, Math.floor(size / 2))) return "margin";
  return "";
}

async function decoded(file) {
  const decodedImage = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meta = await sharp(file).metadata();
  return {
    data: decodedImage.data,
    width: decodedImage.info.width,
    height: decodedImage.info.height,
    hasAlpha: meta.hasAlpha === true,
  };
}

function tags(job) {
  if (job.alpha === "rounded") return "mask rounded";
  if (job.alpha === "none") return "alpha none";
  if (job.margin) return `margin ${job.margin}`;
  return "alpha keep";
}

const checkOnly = process.argv.includes("--check");

if (!checkOnly) {
  for (const job of pngJobs) {
    const data = await renderSquare(job);
    writeFileSync(brandPath(job.name), await encode(data, job.size, job.alpha));
  }
  const frames = [];
  for (const size of icoSizes) {
    const data = await renderSquare({ name: icoName, size, alpha: "rounded" });
    frames.push(await encode(data, size, "rounded"));
  }
  writeFileSync(brandPath(icoName), writeIco(frames));
}

let failed = 0;
for (const job of pngJobs) {
  const expected = await renderSquare(job);
  const file = brandPath(job.name);
  const actual = await decoded(file);
  const name = job.name;
  if (actual.width !== job.size || actual.height !== job.size) {
    process.stdout.write(`${name} size\n`);
    failed++;
    continue;
  }
  const delta = maxDelta(actual.data, expected);
  const mask = maskFailure(actual.data, job.size, job.alpha, job.margin ?? 0);
  if (job.alpha === "none" && actual.hasAlpha) {
    process.stdout.write(`${name} alpha\n`);
    failed++;
  }
  if (job.alpha !== "none" && !actual.hasAlpha) {
    process.stdout.write(`${name} alpha\n`);
    failed++;
  }
  if (delta > 1 || mask) failed++;
  process.stdout.write(`${name} max ${Number.isFinite(delta) ? delta : "inf"}${mask ? ` ${mask}` : ""} ${tags(job)}\n`);
}

const ico = readIco(readFileSync(brandPath(icoName)));
if (ico.length !== icoSizes.length) {
  process.stdout.write(`${icoName} size\n`);
  failed++;
}
for (let index = 0; index < icoSizes.length; index++) {
  const size = icoSizes[index];
  const frame = ico[index];
  if (!frame) {
    process.stdout.write(`${icoName} ${size} size\n`);
    failed++;
    continue;
  }
  const actual = await decoded(frame);
  const expected = await renderSquare({ name: icoName, size, alpha: "rounded" });
  if (actual.width !== size || actual.height !== size) {
    process.stdout.write(`${icoName} ${size} size\n`);
    failed++;
    continue;
  }
  const delta = maxDelta(actual.data, expected);
  const mask = maskFailure(actual.data, size, "rounded", 0);
  if (delta > 1 || mask) failed++;
  process.stdout.write(
    `${icoName} ${size} max ${Number.isFinite(delta) ? delta : "inf"}${mask ? ` ${mask}` : ""} mask rounded\n`,
  );
}

if (failed > 0) process.exitCode = 1;
