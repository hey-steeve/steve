import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../.github/workflows/eval-live.yml"),
  "utf8",
);

it("skips live eval unless the flag is true and the ref is main", () => {
  expect(source).toMatch(/^permissions:\n {2}contents: read\n/m);
  expect(source).not.toMatch(/^\s*pull_request:/m);
  const found = preflights(source);
  expect(found.map((item) => item.job)).toEqual(["emergency-gate", "triage-eval"]);
  expect(
    found.map((item) => ({
      job: item.job,
      blocksUnlessEnabled: blocksUnlessEnabled(item.script),
      requiresMain: requiresMain(item.script),
      passesRef: item.env.includes("github.ref"),
    })),
  ).toEqual([
    {
      job: "emergency-gate",
      blocksUnlessEnabled: true,
      requiresMain: true,
      passesRef: true,
    },
    {
      job: "triage-eval",
      blocksUnlessEnabled: true,
      requiresMain: true,
      passesRef: true,
    },
  ]);
});

type Preflight = {
  readonly job: string;
  readonly env: string;
  readonly script: string;
};

function preflights(yaml: string): Preflight[] {
  const lines = yaml.split("\n");
  const found: Preflight[] = [];
  let job = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const jobName = /^ {2}([a-z0-9-]+):\s*$/.exec(line)?.[1];
    if (jobName !== undefined) {
      job = jobName;
    }
    if (!line.includes("name: Check live eval gate")) {
      continue;
    }
    const env: string[] = [];
    const script: string[] = [];
    let mode: "seek" | "env" | "script" = "seek";
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const current = lines[cursor] ?? "";
      if (mode === "seek" && /^ {8}env:\s*$/.test(current)) {
        mode = "env";
        continue;
      }
      if (mode === "env") {
        if (/^ {10}\S/.test(current)) {
          env.push(current.trim());
          continue;
        }
        mode = "seek";
      }
      if (mode === "seek" && /^ {8}run:\s*\|\s*$/.test(current)) {
        mode = "script";
        continue;
      }
      if (mode === "script") {
        if (current.trim().length === 0 || current.startsWith("          ")) {
          script.push(current.trimEnd());
          continue;
        }
        break;
      }
      if (/^ {4}- /.test(current)) {
        break;
      }
    }
    found.push({ job, env: env.join("\n"), script: script.join("\n") });
  }
  return found;
}

function blocksUnlessEnabled(script: string): boolean {
  const stack: string[] = [];
  let saw = false;
  for (const line of script.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("if ")) {
      stack.push(trimmed);
    }
    if (trimmed.includes('"$LIVE_EVAL_ENABLED"') && trimmed.includes('"true"')) {
      saw = true;
      if (!trimmed.includes("!=")) {
        return false;
      }
      for (const frame of stack.slice(0, -1)) {
        if (frame.includes("schedule")) {
          return false;
        }
      }
    }
    if (trimmed === "fi" || trimmed.startsWith("fi;") || trimmed.startsWith("fi ")) {
      stack.pop();
    }
  }
  return saw;
}

function requiresMain(script: string): boolean {
  const lines = script.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!isUnequalMainRef(lines[index]?.trim() ?? "")) {
      continue;
    }
    if (branchSkipsAndExits(lines, index + 1)) {
      return true;
    }
  }
  return false;
}

function isUnequalMainRef(line: string): boolean {
  return (
    line.startsWith("if ") &&
    line.includes("!=") &&
    line.includes("refs/heads/main") &&
    /GITHUB_REF|github\.ref/.test(line)
  );
}

function branchSkipsAndExits(lines: readonly string[], start: number): boolean {
  let depth = 1;
  let writesSkip = false;
  let exits = false;
  for (let index = start; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";
    if (trimmed.startsWith("if ")) {
      depth += 1;
      continue;
    }
    if (trimmed === "fi" || trimmed.startsWith("fi;") || trimmed.startsWith("fi ")) {
      depth -= 1;
      if (depth === 0) {
        return writesSkip && exits;
      }
      continue;
    }
    if (depth !== 1) {
      continue;
    }
    if (trimmed.includes("skip=true")) {
      writesSkip = true;
    }
    if (/(?:^|[;&|])\s*exit\s+0(?:\s|$)/.test(trimmed)) {
      exits = true;
    }
  }
  return false;
}
