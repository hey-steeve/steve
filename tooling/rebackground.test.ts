import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

it("keeps subject pixels outside the lavender edge", () => {
  const result = spawnSync(process.execPath, ["tooling/rebackground.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  const lines = (result.stdout ?? "").split("\n").filter((line) => line.includes(" clips "));
  expect(result.status, result.stdout ?? result.stderr ?? "").toBe(0);
  expect(lines.length).toBeGreaterThan(10);
  for (const line of lines) {
    expect(line).toContain(" clips 0");
  }
});
