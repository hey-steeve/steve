import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

it("keeps non-background pixels equal to the original, within 2 levels only on the outline", () => {
  const result = spawnSync(process.execPath, ["tooling/rebackground.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  const output = result.stdout ?? "";
  const lines = output.split("\n").filter((line) => line.includes("changed non-bg"));
  expect(output).toContain("outline tolerance 2");
  expect(result.status, output || result.stderr || "").toBe(0);
  expect(lines.length).toBeGreaterThan(10);
  for (const line of lines) {
    expect(line).toContain("changed non-bg 0");
  }
});
