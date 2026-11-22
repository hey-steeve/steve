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

function distance(red, green, blue) {
  return Math.hypot(red - oldLavender[0], green - oldLavender[1], blue - oldLavender[2]);
}

function rebackground(src, width, height, background) {
  const backdrop = floodBackdrop(src, width, height);
  const { edge, interior } = edgeMap(backdrop, width, height);
  const out = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const alpha = src[offset + 3];
    out[offset + 3] = alpha;
    if (alpha === 0 || (!backdrop[index] && !edge[index])) {
      out[offset] = src[offset];
      out[offset + 1] = src[offset + 1];
      out[offset + 2] = src[offset + 2];
      continue;
    }
    if (!edge[index]) {
      out[offset] = background[0];
      out[offset + 1] = background[1];
      out[offset + 2] = background[2];
      continue;
    }
    const x = index % width;
    const y = (index / width) | 0;
    const foreground = nearestBody(src, interior, width, height, x, y);
    const painted = paintEdge(src, offset, foreground, background);
    out[offset] = painted[0];
    out[offset + 1] = painted[1];
    out[offset + 2] = painted[2];
  }
  return out;
}

const fieldGap = 32;
const fieldRedGreen = 16;
const fieldBlueGreen = 24;
const fieldBlueRedMin = 6;
const fieldBlueRedMax = 24;
const edgeTolerance = 1;

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

function touches(mask, width, height, x, y) {
  for (const [dx, dy] of neighbors) {
    const nextX = x + dx;
    const nextY = y + dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
    if (mask[nextY * width + nextX]) return true;
  }
  return false;
}

function edgeMap(backdrop, width, height) {
  const count = width * height;
  const edge = new Uint8Array(count);
  const interior = new Uint8Array(count);
  const body = new Uint8Array(count);
  for (let index = 0; index < count; index++) body[index] = backdrop[index] ? 0 : 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!backdrop[index] && touches(backdrop, width, height, x, y)) edge[index] = 1;
      else if (backdrop[index] && touches(body, width, height, x, y)) edge[index] = 1;
      else if (!backdrop[index]) interior[index] = 1;
    }
  }
  return { edge, interior };
}

function nearestBody(src, interior, width, height, x, y) {
  let best = Number.POSITIVE_INFINITY;
  let found = null;
  for (let radius = 1; radius < width + height; radius++) {
    if (radius * radius > best) break;
    for (let dy = -radius; dy <= radius; dy++) {
      const nextY = y + dy;
      if (nextY < 0 || nextY >= height) continue;
      const along = Math.abs(dy) === radius;
      for (let dx = -radius; dx <= radius; dx++) {
        if (!along && Math.abs(dx) !== radius) continue;
        const nextX = x + dx;
        if (nextX < 0 || nextX >= width) continue;
        if (!interior[nextY * width + nextX]) continue;
        const distance2 = dx * dx + dy * dy;
        if (distance2 > best) continue;
        if (
          distance2 === best &&
          found &&
          (nextY > found.y || (nextY === found.y && nextX >= found.x))
        ) {
          continue;
        }
        best = distance2;
        const offset = (nextY * width + nextX) * 4;
        found = {
          x: nextX,
          y: nextY,
          red: src[offset],
          green: src[offset + 1],
          blue: src[offset + 2],
        };
      }
    }
  }
  return found;
}

function coverage(colour, foreground, backdrop) {
  const body = [foreground.red, foreground.green, foreground.blue];
  let dot = 0;
  let length = 0;
  for (let channel = 0; channel < 3; channel++) {
    const span = body[channel] - backdrop[channel];
    dot += (colour[channel] - backdrop[channel]) * span;
    length += span * span;
  }
  if (length === 0) return 0;
  return Math.min(1, Math.max(0, dot / length));
}

function composite(alpha, foreground, backdrop) {
  const body = [foreground.red, foreground.green, foreground.blue];
  return body.map((channel, index) => Math.round(alpha * channel + (1 - alpha) * backdrop[index]));
}

function paintEdge(src, offset, foreground, background) {
  if (!foreground) return [background[0], background[1], background[2]];
  const colour = [src[offset], src[offset + 1], src[offset + 2]];
  return composite(coverage(colour, foreground, oldLavender), foreground, background);
}

function mixError(colour, foreground, backdrop) {
  if (!foreground) {
    return Math.max(
      Math.abs(colour[0] - backdrop[0]),
      Math.abs(colour[1] - backdrop[1]),
      Math.abs(colour[2] - backdrop[2]),
    );
  }
  const mixed = composite(coverage(colour, foreground, backdrop), foreground, backdrop);
  return Math.max(
    Math.abs(colour[0] - mixed[0]),
    Math.abs(colour[1] - mixed[1]),
    Math.abs(colour[2] - mixed[2]),
  );
}

function residualFringe(colour, foreground, background) {
  const lavenderError = mixError(colour, foreground, oldLavender);
  const backgroundError = mixError(colour, foreground, background);
  return lavenderError + edgeTolerance < backgroundError;
}

function channelDelta(src, dst, offset) {
  return Math.max(
    Math.abs(src[offset] - dst[offset]),
    Math.abs(src[offset + 1] - dst[offset + 1]),
    Math.abs(src[offset + 2] - dst[offset + 2]),
    Math.abs(src[offset + 3] - dst[offset + 3]),
  );
}

function clipReport(name, src, dst, width, height, background) {
  const backdrop = floodBackdrop(src, width, height);
  const { edge, interior } = edgeMap(backdrop, width, height);
  let body = 0;
  let edgeMiss = 0;
  let fringe = 0;
  let field = 0;
  let sample = null;
  const note = (kind, x, y, from, to) => {
    if (sample) return;
    sample = `${kind} ${x},${y} ${from} -> ${to}`;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      const alpha = src[offset + 3];
      if (alpha === 0 || interior[index]) {
        if (channelDelta(src, dst, offset) !== 0) {
          body++;
          note(
            "body",
            x,
            y,
            hex(src[offset], src[offset + 1], src[offset + 2]),
            hex(dst[offset], dst[offset + 1], dst[offset + 2]),
          );
        }
        continue;
      }
      if (edge[index]) {
        const foreground = nearestBody(src, interior, width, height, x, y);
        const expected = paintEdge(src, offset, foreground, background);
        const delta = Math.max(
          Math.abs(dst[offset] - expected[0]),
          Math.abs(dst[offset + 1] - expected[1]),
          Math.abs(dst[offset + 2] - expected[2]),
          Math.abs(dst[offset + 3] - alpha),
        );
        if (delta > edgeTolerance) {
          edgeMiss++;
          note(
            "edge",
            x,
            y,
            hex(expected[0], expected[1], expected[2]),
            hex(dst[offset], dst[offset + 1], dst[offset + 2]),
          );
        }
        const colour = [dst[offset], dst[offset + 1], dst[offset + 2]];
        if (residualFringe(colour, foreground, background)) {
          fringe++;
          note(
            "fringe",
            x,
            y,
            hex(oldLavender[0], oldLavender[1], oldLavender[2]),
            hex(colour[0], colour[1], colour[2]),
          );
        }
        continue;
      }
      const flat =
        dst[offset] === background[0] &&
        dst[offset + 1] === background[1] &&
        dst[offset + 2] === background[2] &&
        dst[offset + 3] === alpha;
      if (!flat) {
        field++;
        note(
          "field",
          x,
          y,
          hex(background[0], background[1], background[2]),
          hex(dst[offset], dst[offset + 1], dst[offset + 2]),
        );
      }
    }
  }
  const lines = [`${name} body ${body} edge ${edgeMiss} fringe ${fringe} field ${field}`];
  if (sample) lines.push(`  ${sample}`);
  return {
    body,
    edge: edgeMiss,
    fringe,
    field,
    text: `${lines.join("\n")}\n`,
  };
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

let failed = 0;
process.stdout.write(`edge tolerance ${edgeTolerance}\n`);
for (const [from, to, background] of jobs) {
  const source = await decodedRaw(path.join(repo, from));
  const derived = await decodedRaw(path.join(repo, to));
  if (source.width !== derived.width || source.height !== derived.height) {
    process.stdout.write(`${path.basename(to)} size\n`);
    failed++;
    continue;
  }
  const report = clipReport(
    path.basename(to),
    source.data,
    derived.data,
    source.width,
    source.height,
    background,
  );
  failed += report.body + report.edge + report.fringe + report.field;
  process.stdout.write(report.text);
}

const [icoFrom] = icoJob;
const sourceIco = readIco(readFileSync(path.join(repo, icoFrom)));
const derivedIco = readIco(readFileSync(path.join(repo, icoJob[1])));
if (sourceIco.length !== derivedIco.length) {
  process.stdout.write(`favicon-page.ico size\n`);
  failed++;
}
for (let index = 0; index < Math.min(sourceIco.length, derivedIco.length); index++) {
  const source = await decodedRaw(sourceIco[index]);
  const derived = await decodedRaw(derivedIco[index]);
  if (source.width !== derived.width || source.height !== derived.height) {
    process.stdout.write(`favicon-page.ico ${source.width} size\n`);
    failed++;
    continue;
  }
  const report = clipReport(
    `favicon-page.ico ${source.width}`,
    source.data,
    derived.data,
    source.width,
    source.height,
    icoJob[2],
  );
  failed += report.body + report.edge + report.fringe + report.field;
  process.stdout.write(report.text);
}
if (failed > 0) process.exitCode = 1;
