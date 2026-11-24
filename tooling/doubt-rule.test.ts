import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doubtRule = "Doubt does not default to 15";

it("keeps the doubt rule in AGENTS.md and the triage README", () => {
  const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const triage = readFileSync(path.join(root, "features/triage/README.md"), "utf8");
  expect(agents).toContain(doubtRule);
  expect(triage).toContain(doubtRule);
});
