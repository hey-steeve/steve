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

function isBackdrop(red, green, blue) {
  const blueCast = blue - red;
  if (blueCast > 22) return false;
  const gap = distance(red, green, blue);
  if (gap <= 22 && red + 2 >= green) return true;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return gap <= 36 && chroma >= 20 && blueCast >= 4 && red >= green && blue >= green + 8;
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function srgb(channel) {
  const value = Math.min(1, Math.max(0, channel));
  const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, encoded * 255)));
}

function coverage(color, backdrop) {
  let limit = 1;
  for (let channel = 0; channel < 3; channel++) {
    const pixel = color[channel];
    const matte = backdrop[channel];
    let cap = 1;
    if (matte > 1e-8) cap = Math.min(cap, pixel / matte);
    if (matte < 1 - 1e-8) cap = Math.min(cap, (1 - pixel) / (1 - matte));
    limit = Math.min(limit, cap);
  }
  if (!Number.isFinite(limit)) return 0;
  return Math.min(1, Math.max(0, limit));
}

function rebackground(src, width, height, next) {
  const candidate = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    if (src[offset + 3] === 0 || isBackdrop(src[offset], src[offset + 1], src[offset + 2])) {
      candidate[index] = 1;
    }
  }
  const backdrop = new Uint8Array(width * height);
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (x, y) => {
    const index = y * width + x;
    if (!candidate[index] || backdrop[index]) return;
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
  const seenHole = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (!candidate[start] || backdrop[start] || seenHole[start]) continue;
      const stack = [start];
      const component = [];
      seenHole[start] = 1;
      let nearest = 999;
      while (stack.length > 0) {
        const index = stack.pop();
        component.push(index);
        const offset = index * 4;
        if (src[offset + 3] !== 0) {
          nearest = Math.min(nearest, distance(src[offset], src[offset + 1], src[offset + 2]));
        }
        const cellX = index % width;
        const cellY = (index / width) | 0;
        for (const [dx, dy] of steps) {
          const nextX = cellX + dx;
          const nextY = cellY + dy;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
          const neighbor = nextY * width + nextX;
          if (!candidate[neighbor] || backdrop[neighbor] || seenHole[neighbor]) continue;
          seenHole[neighbor] = 1;
          stack.push(neighbor);
        }
      }
      if (nearest > 4) continue;
      for (const index of component) backdrop[index] = 1;
    }
  }

  const nearR = new Int16Array(width * height);
  const nearG = new Int16Array(width * height);
  const nearB = new Int16Array(width * height);
  const seen = new Uint8Array(width * height);
  const fringeX = new Int32Array(width * height);
  const fringeY = new Int32Array(width * height);
  let fringeHead = 0;
  let fringeTail = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!backdrop[index] || src[index * 4 + 3] === 0) continue;
      seen[index] = 1;
      nearR[index] = src[index * 4];
      nearG[index] = src[index * 4 + 1];
      nearB[index] = src[index * 4 + 2];
      fringeX[fringeTail] = x;
      fringeY[fringeTail] = y;
      fringeTail++;
    }
  }
  const fringe = new Uint8Array(width * height);
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (fringeHead < fringeTail) {
    const x = fringeX[fringeHead];
    const y = fringeY[fringeHead];
    const index = y * width + x;
    fringeHead++;
    if (fringe[index] >= 2) continue;
    for (const [dx, dy] of neighbors) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
      const neighbor = nextY * width + nextX;
      if (seen[neighbor]) continue;
      seen[neighbor] = 1;
      fringe[neighbor] = fringe[index] + 1;
      nearR[neighbor] = nearR[index];
      nearG[neighbor] = nearG[index];
      nearB[neighbor] = nearB[index];
      fringeX[fringeTail] = nextX;
      fringeY[fringeTail] = nextY;
      fringeTail++;
    }
  }

  const out = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const alpha = src[offset + 3];
    if (alpha === 0 || backdrop[index]) {
      if (alpha === 0) {
        out[offset + 3] = 0;
      } else {
        out[offset] = next[0];
        out[offset + 1] = next[1];
        out[offset + 2] = next[2];
        out[offset + 3] = alpha;
      }
      continue;
    }
    if (fringe[index] > 0 && fringe[index] <= 2) {
      const matte = [linear(nearR[index]), linear(nearG[index]), linear(nearB[index])];
      const color = [linear(src[offset]), linear(src[offset + 1]), linear(src[offset + 2])];
      const amount = coverage(color, matte);
      if ((fringe[index] === 1 || amount >= 0.35) && amount > 0.02) {
        for (let channel = 0; channel < 3; channel++) {
          out[offset + channel] = srgb(color[channel] + amount * (linear(next[channel]) - matte[channel]));
        }
        out[offset + 3] = alpha;
        continue;
      }
    }
    out[offset] = src[offset];
    out[offset + 1] = src[offset + 1];
    out[offset + 2] = src[offset + 2];
    out[offset + 3] = alpha;
  }
  return out;
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
