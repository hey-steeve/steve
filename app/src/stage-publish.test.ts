import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { publishStaging } from "./stage-publish.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps the published folder when staging is empty", () => {
  const root = mkdtempSync(path.join(tmpdir(), "steve-stage-"));
  temps.push(root);
  const staging = path.join(root, "staging");
  const dest = path.join(root, "mascot");
  mkdirSync(staging);
  mkdirSync(dest);
  writeFileSync(path.join(dest, "shrug.webp"), "keep");

  publishStaging(staging, dest);

  expect(readdirSync(dest)).toEqual(["shrug.webp"]);
});
