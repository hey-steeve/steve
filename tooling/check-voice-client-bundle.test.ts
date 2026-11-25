import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  expect(result.output).toContain("key name");
  expect(result.output).toContain("bad.js");
  expect(result.output).not.toContain("process.env");
});

it("fails a tree that contains a key value and does not print it", () => {
  const dir = fixture({ "chunks/leak.js": `var k="${canary}";` });
  const result = scan(dir);
  expect(result.status).toBe(1);
  expect(result.output).toContain("key value");
  expect(result.output).toContain("leak.js");
  expect(result.output.includes(canary)).toBe(false);
});

it("fails when the scan directory is missing", () => {
  const dir = fixture({});
  expect(scan(path.join(dir, "absent")).status).toBe(1);
});
