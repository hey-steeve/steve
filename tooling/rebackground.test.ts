import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

it("keeps body pixels exact and recomposites the edge off the lavender matte", () => {
  const result = spawnSync(process.execPath, ["tooling/rebackground.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  const output = result.stdout ?? "";
  const lines = output.split("\n").filter((line) => line.includes(" body "));
  expect(output).toContain("edge tolerance 1");
  expect(result.status, output || result.stderr || "").toBe(0);
  expect(lines.map((line) => line.split(" ")[0])).toEqual([
    "pfp-lavender-profile.png",
    "og-image-page.png",
  ]);
  expect(output).not.toContain("icon-1024-page.png");
  expect(output).not.toContain("favicon-page.ico");
  for (const line of lines) {
    expect(line).toContain(" body 0");
    expect(line).toContain(" edge 0");
    expect(line).toContain(" fringe 0");
    expect(line).toContain(" field 0");
  }
});
