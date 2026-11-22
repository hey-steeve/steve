import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const body = path.join(root, "shared/assets/mascot/body");
const sourceHash = "9b4a29ed502ef2c3f3f86c7e03a11334d445da2a11581f3172b4c544e4983701";

it("copies lounge-call-page from lounge-call-source-eff1fe.png", () => {
  const result = spawnSync(process.execPath, ["tooling/mascot-page.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  const output = result.stdout ?? "";
  expect(result.status, output || result.stderr || "").toBe(0);
  expect(output).toContain("lounge-call-page.png max 0 alpha none copy transparent 0");
  expect(output).not.toContain("lanczos3");

  const source = readFileSync(path.join(body, "lounge-call-source-eff1fe.png"));
  const page = readFileSync(path.join(body, "lounge-call-page.png"));
  const hash = createHash("sha256").update(source).digest("hex");
  expect(hash).toBe(sourceHash);
  expect(createHash("sha256").update(page).digest("hex")).toBe(sourceHash);
  expect(Buffer.compare(source, page)).toBe(0);
  const sums = readFileSync(path.join(root, "shared/assets/mascot/SHA256SUMS"), "utf8");
  expect(sums.split("\n")).toContain(`${sourceHash}  body/lounge-call-source-eff1fe.png`);
  expect(sums.split("\n")).toContain(`${sourceHash}  body/lounge-call-page.png`);
});
