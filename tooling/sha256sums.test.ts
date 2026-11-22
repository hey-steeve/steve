import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function trackedSums(): readonly string[] {
  const listed = spawnSync("git", ["ls-files", "-z", "--", "**/SHA256SUMS"], {
    cwd: root,
    encoding: "utf8",
  });
  expect(listed.status, listed.stderr ?? "").toBe(0);
  return listed.stdout.split("\0").filter((name) => name.length > 0);
}

function staleEntries(relativeSums: string): string[] {
  const dir = path.join(root, path.dirname(relativeSums));
  const stale: string[] = [];
  for (const line of readFileSync(path.join(root, relativeSums), "utf8").split("\n")) {
    if (line.length === 0) continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    const recorded = match?.[1];
    const name = match?.[2];
    if (recorded === undefined || name === undefined) {
      stale.push(`${relativeSums}: unreadable line`);
      continue;
    }
    const actual = createHash("sha256").update(readFileSync(path.join(dir, name))).digest("hex");
    if (actual !== recorded) {
      stale.push(path.posix.join(path.dirname(relativeSums), name));
    }
  }
  return stale;
}

it("matches every SHA256SUMS entry to its file", () => {
  const files = trackedSums();
  expect(files.length).toBeGreaterThan(0);
  expect(files.flatMap(staleEntries)).toEqual([]);
});
