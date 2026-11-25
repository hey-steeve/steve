import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-voice-client-bundle.mjs");
const canary = "xai-test-canary-0123456789abcdef";
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "voice-bundle-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return dir;
}

function scan(dir: string) {
  const result = spawnSync("node", [script, dir], { encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

it("passes a clean tree", () => {
  const dir = fixture({ "chunks/app.js": "console.warn('hello');", "css/a.css": "a{}" });
  expect(scan(dir).status).toBe(0);
});

it("fails a tree that contains the key name and reports the file", () => {
  const dir = fixture({ "chunks/ok.js": "1", "chunks/bad.js": "process.env.XAI_API_KEY" });
  const result = scan(dir);
  expect(result.status).toBe(1);
  expect(result.output.includes("key name")).toBe(true);
  expect(result.output.includes("bad.js")).toBe(true);
  expect(result.output.includes("process.env")).toBe(false);
});

it("fails a tree that contains a key value and does not print it", () => {
  const dir = fixture({ "chunks/leak.js": `var k="${canary}";` });
  const result = scan(dir);
  expect(result.status).toBe(1);
  expect(result.output.includes("key value")).toBe(true);
  expect(result.output.includes("leak.js")).toBe(true);
  expect(result.output.includes(canary)).toBe(false);
});

it("fails when the scan directory is missing", () => {
  const dir = fixture({});
  expect(scan(path.join(dir, "absent")).status).toBe(1);
});

it("fails when the key appears only in an asset filename", () => {
  const dir = fixture({ [`media/${canary}.png`]: "harmless" });
  const result = scan(dir);
  expect(result.status).toBe(1);
  expect(result.output.includes("key value")).toBe(true);
});

it("redacts a key-bearing filename and directory from the scanner output", () => {
  const dir = fixture({
    [`${canary}/inner.js`]: "1",
    [`chunks/XAI_API_KEY-${canary}.js`]: "1",
  });
  const result = scan(dir);
  expect(result.status).toBe(1);
  expect(result.output.includes(canary)).toBe(false);
  expect(result.output.includes("XAI_API_KEY")).toBe(false);
  expect(result.output.includes("[redacted]")).toBe(true);
});

it("fails an empty directory", () => {
  const result = scan(fixture({}));
  expect(result.status).toBe(1);
  expect(result.output.includes("no files were scanned")).toBe(true);
});

it("fails a directory with files but no JavaScript assets", () => {
  const result = scan(fixture({ "css/a.css": "a{}" }));
  expect(result.status).toBe(1);
  expect(result.output.includes("no JavaScript assets")).toBe(true);
});

it("flags a key-bearing empty directory and redacts it", () => {
  const dir = fixture({ "chunks/ok.js": "1" });
  mkdirSync(path.join(dir, canary));
  const result = scan(dir);
  expect(result.status).toBe(1);
  expect(result.output.includes("key value (in path)")).toBe(true);
  expect(result.output.includes(canary)).toBe(false);
  expect(result.output.includes("[redacted]")).toBe(true);
});

it("flags a key-bearing scan root without printing its name", () => {
  const parent = fixture({});
  const root = path.join(parent, canary);
  mkdirSync(root);
  writeFileSync(path.join(root, "a.js"), "1");
  const result = scan(root);
  expect(result.status).toBe(1);
  expect(result.output.includes("key value (in path)")).toBe(true);
  expect(result.output.includes(canary)).toBe(false);
});

it("still runs when the script is invoked through a symlink", () => {
  const links = fixture({});
  const link = path.join(links, "check.mjs");
  symlinkSync(script, link);
  const run = (target: string) => {
    const result = spawnSync("node", [link, target], { encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };
  expect(run(fixture({ "a.js": "1" })).status).toBe(0);
  const empty = run(fixture({}));
  expect(empty.status).toBe(1);
  expect(empty.output.includes("no files were scanned")).toBe(true);
  const leak = run(fixture({ "a.js": `var k="${canary}";` }));
  expect(leak.status).toBe(1);
  expect(leak.output.includes(canary)).toBe(false);
});
