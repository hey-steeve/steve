import { expect, it } from "vitest";
import { readTriageLog, recordTriageLog, resetTriageLog, triageLogLimit } from "./triage-log.js";

it("keeps the triage log to the latest reasons", () => {
  resetTriageLog();
  const total = triageLogLimit + 5;
  for (let index = 0; index < total; index += 1) {
    recordTriageLog({
      cause: "no-triage",
      reason: index === total - 1 ? "missing-key" : "http",
    });
  }
  const entries = readTriageLog();
  expect(entries).toHaveLength(triageLogLimit);
  expect(entries.at(-1)).toEqual({ cause: "no-triage", reason: "missing-key" });
  expect(entries.some((entry) => entry.reason === "http")).toBe(true);
  const encoded = JSON.stringify(entries);
  expect(encoded).not.toContain("De garde");
  expect(encoded).not.toContain("session");
});
