import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "app/package.json"));
const sharp = require("sharp");

const oldLavender = [218, 196, 232];
const page = [239, 241, 254];
const profile = [218, 221, 254];

const jobs = [
  ["shared/assets/mascot/avatar/pfp-lavender.png", "shared/assets/mascot/avatar/pfp-lavender-profile.png", profile],
  ["shared/assets/mascot/body/lounge-call.png", "shared/assets/mascot/body/lounge-call-page.png", page],
  ["shared/assets/brand/icon-1024.png", "shared/assets/brand/icon-1024-page.png", page],
  ["shared/assets/brand/icon-512.png", "shared/assets/brand/icon-512-page.png", page],
  ["shared/assets/brand/icon-maskable-512.png", "shared/assets/brand/icon-maskable-512-page.png", page],
  ["shared/assets/brand/icon-192.png", "shared/assets/brand/icon-192-page.png", page],
  ["shared/assets/brand/apple-touch-icon.png", "shared/assets/brand/apple-touch-icon-page.png", page],
  ["shared/assets/brand/favicon-32.png", "shared/assets/brand/favicon-32-page.png", page],
  ["shared/assets/brand/favicon-16.png", "shared/assets/brand/favicon-16-page.png", page],
  ["shared/assets/brand/og-image.png", "shared/assets/brand/og-image-page.png", page],
];

const icoJob = ["shared/assets/brand/favicon.ico", "shared/assets/brand/favicon-page.ico", page];

const steps = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function distance(red, green, blue) {
  return Math.hypot(red - oldLavender[0], green - oldLavender[1], blue - oldLavender[2]);
}

function rebackground(src, width, height, background) {
  const backdrop = floodBackdrop(src, width, height);
  const out = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const alpha = src[offset + 3];
    if (!backdrop[index] || alpha === 0) {
      out[offset] = src[offset];
      out[offset + 1] = src[offset + 1];
      out[offset + 2] = src[offset + 2];
      out[offset + 3] = alpha;
      continue;
    }
    out[offset] = background[0];
    out[offset + 1] = background[1];
    out[offset + 2] = background[2];
    out[offset + 3] = alpha;
  }
  return out;
}

const fieldGap = 32;
const fieldRedGreen = 16;
const fieldBlueGreen = 24;
const fieldBlueRedMin = 6;
const fieldBlueRedMax = 24;
const outlineTolerance = 2;

function channelGap(red, green, blue) {
  return Math.max(
    Math.abs(red - oldLavender[0]),
    Math.abs(green - oldLavender[1]),
    Math.abs(blue - oldLavender[2]),
  );
}

function isField(red, green, blue, alpha) {
  if (alpha === 0) return true;
  const redGreen = red - green;
  const blueGreen = blue - green;
  const blueRed = blue - red;
  if (redGreen < fieldRedGreen || blueGreen < fieldBlueGreen) return false;
  if (blueRed < fieldBlueRedMin || blueRed > fieldBlueRedMax) return false;
  return channelGap(red, green, blue) <= fieldGap;
}

function floodBackdrop(src, width, height) {
  const count = width * height;
  const backdrop = new Uint8Array(count);
  const queueX = new Int32Array(count);
  const queueY = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    const index = y * width + x;
    if (backdrop[index]) return;
    const offset = index * 4;
    if (!isField(src[offset], src[offset + 1], src[offset + 2], src[offset + 3])) return;
    backdrop[index] = 1;
    queueX[tail] = x;
    queueY[tail] = y;
    tail++;
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head++;
    for (const [dx, dy] of steps) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      push(nextX, nextY);
    }
  }
  return backdrop;
}

function hex(red, green, blue) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function longestRuns(mask, width, height) {
  let vertical = null;
  let horizontal = null;
  for (let x = 0; x < width; x++) {
    let run = 0;
    let y0 = 0;
    for (let y = 0; y <= height; y++) {
      const on = y < height && mask[y * width + x] === 1;
      if (on) {
        if (run === 0) y0 = y;
        run++;
      } else if (run > 0) {
        if (!vertical || run > vertical.len) vertical = { x, y0, y1: y - 1, len: run };
        run = 0;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    let run = 0;
    let x0 = 0;
    for (let x = 0; x <= width; x++) {
      const on = x < width && mask[y * width + x] === 1;
      if (on) {
        if (run === 0) x0 = x;
        run++;
      } else if (run > 0) {
        if (!horizontal || run > horizontal.len) {
          horizontal = { y, x0, x1: x - 1, len: run };
        }
        run = 0;
      }
    }
  }
  return { vertical, horizontal };
}

function touchesField(backdrop, width, height, x, y) {
  for (const [dx, dy] of steps) {
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
    if (backdrop[nextY * width + nextX]) return true;
  }
  return false;
}

function channelDelta(src, dst, offset) {
  return Math.max(
    Math.abs(src[offset] - dst[offset]),
    Math.abs(src[offset + 1] - dst[offset + 1]),
    Math.abs(src[offset + 2] - dst[offset + 2]),
    Math.abs(src[offset + 3] - dst[offset + 3]),
  );
}

function clipReport(name, src, dst, width, height) {
  const backdrop = floodBackdrop(src, width, height);
  const bad = new Uint8Array(width * height);
  let count = 0;
  let body = 0;
  let outline = 0;
  let left = null;
  let right = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (backdrop[index]) continue;
      const offset = index * 4;
      const delta = channelDelta(src, dst, offset);
      if (delta === 0) continue;
      const onOutline = touchesField(backdrop, width, height, x, y);
      if (onOutline && delta <= outlineTolerance) continue;
      bad[index] = 1;
      count++;
      if (onOutline) outline++;
      else body++;
      const sample = {
        x,
        y,
        from: hex(src[offset], src[offset + 1], src[offset + 2]),
        to: hex(dst[offset], dst[offset + 1], dst[offset + 2]),
      };
      if (!left || x < left.x || (x === left.x && y < left.y)) left = sample;
      if (!right || x > right.x || (x === right.x && y < right.y)) right = sample;
    }
  }
  const runs = longestRuns(bad, width, height);
  const lines = [`${name} changed non-bg ${count}`];
  if (count > 0) {
    lines.push(`  body ${body}`);
    lines.push(`  outline ${outline}`);
    if (runs.vertical) {
      const at = runs.vertical;
      lines.push(`  vertical ${at.x},${at.y0}-${at.y1} len ${at.len}`);
    }
    if (runs.horizontal) {
      const at = runs.horizontal;
      lines.push(`  horizontal ${at.y}:${at.x0}-${at.x1} len ${at.len}`);
    }
    if (left) lines.push(`  left ${left.x},${left.y} ${left.from} -> ${left.to}`);
    if (right) lines.push(`  right ${right.x},${right.y} ${right.from} -> ${right.to}`);
  }
  return { count, text: `${lines.join("\n")}\n` };
}

function ringReport(data, width, height, next) {
  let outer = 0;
  let outerClose = 0;
  let outerMin = Number.POSITIVE_INFINITY;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] === 0) continue;
      const flat =
        data[offset] === next[0] && data[offset + 1] === next[1] && data[offset + 2] === next[2];
      let touchesSubject = false;
      for (const [dx, dy] of steps) {
        const neighbor = ((y + dy) * width + (x + dx)) * 4;
        if (data[neighbor + 3] === 0) continue;
        const neighborFlat =
          data[neighbor] === next[0] &&
          data[neighbor + 1] === next[1] &&
          data[neighbor + 2] === next[2];
        if (!neighborFlat) touchesSubject = true;
      }
      if (!flat || !touchesSubject) continue;
      outer++;
      const gap = distance(data[offset], data[offset + 1], data[offset + 2]);
      outerMin = Math.min(outerMin, gap);
      if (gap <= 30) outerClose++;
    }
  }
  return { outer, outerClose, outerMin };
}

async function paintPng(from, to, background) {
  const source = path.join(repo, from);
  const dest = path.join(repo, to);
  if (source === dest) throw new Error(`refusing to edit ${from} in place`);
  const meta = await sharp(source).metadata();
  const decoded = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const painted = rebackground(decoded.data, decoded.info.width, decoded.info.height, background);
  let image = sharp(painted, {
    raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 },
  });
  if (!meta.hasAlpha) image = image.removeAlpha();
  const report = ringReport(painted, decoded.info.width, decoded.info.height, background);
  return { image, report, name: path.basename(to) };
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

function printReport(name, report) {
  const min = Number.isFinite(report.outerMin) ? report.outerMin.toFixed(1) : "none";
  process.stdout.write(
    `${name} ring ${report.outer} min ${min} close ${report.outerClose}\n`,
  );
  if (report.outer === 0 || report.outerClose > 0) process.exitCode = 1;
}

async function decodedRaw(file) {
  const decoded = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
}

const checkOnly = process.argv.includes("--check");

if (!checkOnly) {
  for (const [from, to, background] of jobs) {
    const painted = await paintPng(from, to, background);
    await painted.image.png({ compressionLevel: 9 }).toFile(path.join(repo, to));
    printReport(painted.name, painted.report);
  }

  const [icoFrom, icoTo, icoBackground] = icoJob;
  const icoImages = readIco(readFileSync(path.join(repo, icoFrom)));
  const paintedIco = [];
  for (const png of icoImages) {
    const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const painted = rebackground(decoded.data, decoded.info.width, decoded.info.height, icoBackground);
    const report = ringReport(painted, decoded.info.width, decoded.info.height, icoBackground);
    printReport(`favicon-page.ico ${decoded.info.width}`, report);
    paintedIco.push(
      await sharp(painted, {
        raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 },
      })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }
  writeFileSync(path.join(repo, icoTo), writeIco(paintedIco));
}

let clips = 0;
process.stdout.write(`outline tolerance ${outlineTolerance}\n`);
for (const [from, to] of jobs) {
  const source = await decodedRaw(path.join(repo, from));
  const derived = await decodedRaw(path.join(repo, to));
  if (source.width !== derived.width || source.height !== derived.height) {
    process.stdout.write(`${path.basename(to)} changed non-bg size\n`);
    clips++;
    continue;
  }
  const report = clipReport(
    path.basename(to),
    source.data,
    derived.data,
    source.width,
    source.height,
  );
  clips += report.count;
  process.stdout.write(report.text);
}

const [icoFrom] = icoJob;
const sourceIco = readIco(readFileSync(path.join(repo, icoFrom)));
const derivedIco = readIco(readFileSync(path.join(repo, icoJob[1])));
if (sourceIco.length !== derivedIco.length) {
  process.stdout.write(`favicon-page.ico changed non-bg size\n`);
  clips++;
}
for (let index = 0; index < Math.min(sourceIco.length, derivedIco.length); index++) {
  const source = await decodedRaw(sourceIco[index]);
  const derived = await decodedRaw(derivedIco[index]);
  if (source.width !== derived.width || source.height !== derived.height) {
    process.stdout.write(`favicon-page.ico ${source.width} changed non-bg size\n`);
    clips++;
    continue;
  }
  const report = clipReport(
    `favicon-page.ico ${source.width}`,
    source.data,
    derived.data,
    source.width,
    source.height,
  );
  clips += report.count;
  process.stdout.write(report.text);
}
if (clips > 0) process.exitCode = 1;
