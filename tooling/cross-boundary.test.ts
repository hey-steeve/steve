import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { crossBoundaryFailure, parseLabelList } from "./cross-boundary.ts";

const appFile = "app/src/page.tsx";
const sharedFile = "shared/src/design-tokens.ts";

const bothTreesMessage = [
  "This pull request changes both app/ and shared/.",
  "",
  "app/:",
  `- ${appFile}`,
  "",
  "shared/:",
  `- ${sharedFile}`,
  "",
  "Split the pull request so app/ and shared/ change in separate pull requests. If the mix is intentional, add the cross-boundary label.",
].join("\n");

it("passes when only app/ changes", () => {
  expect(
    crossBoundaryFailure({
      files: [appFile, "app/package.json"],
      labels: [],
    }),
  ).toBeUndefined();
});

it("passes when only shared/ changes", () => {
  expect(
    crossBoundaryFailure({
      files: [sharedFile],
      labels: [],
    }),
  ).toBeUndefined();
});

it("fails when app/ and shared/ both change", () => {
  expect(
    crossBoundaryFailure({
      files: [appFile, "features/voice/src/index.ts", sharedFile],
      labels: [],
    }),
  ).toBe(bothTreesMessage);
});

it("passes when both trees change and the cross-boundary label is set", () => {
  expect(
    crossBoundaryFailure({
      files: [appFile, sharedFile],
      labels: ["bug", "cross-boundary"],
    }),
  ).toBeUndefined();
});

it("passes when other paths change", () => {
  expect(
    crossBoundaryFailure({
      files: [
        "features/voice/src/index.ts",
        "AGENTS.md",
        ".github/workflows/ci.yml",
      ],
      labels: [],
    }),
  ).toBeUndefined();
});

it("does not treat app-foo/ or shared-x/ as app/ or shared/", () => {
  expect(
    crossBoundaryFailure({
      files: ["app-foo/src/index.ts", "shared-x/src/index.ts"],
      labels: [],
    }),
  ).toBeUndefined();
});

it("names the first five files in each tree", () => {
  const appFiles = [
    "app/a.ts",
    "app/b.ts",
    "app/c.ts",
    "app/d.ts",
    "app/e.ts",
    "app/f.ts",
  ];
  const sharedFiles = [
    "shared/a.ts",
    "shared/b.ts",
    "shared/c.ts",
    "shared/d.ts",
    "shared/e.ts",
    "shared/f.ts",
  ];
  const message = crossBoundaryFailure({
    files: [...appFiles, ...sharedFiles],
    labels: [],
  });
  expect(message).toContain("- app/a.ts");
  expect(message).toContain("- app/e.ts");
  expect(message).not.toContain("app/f.ts");
  expect(message).toContain("- shared/a.ts");
  expect(message).not.toContain("shared/f.ts");
  expect(message).toContain("- and 1 more");
  expect(message).toContain("cross-boundary");
});

const repoRoot = join(import.meta.dirname, "..");
const checkScript = join(repoRoot, "tooling/cross-boundary-check.ts");
const diffCommand =
  'git -c core.quotePath=false diff -z --no-renames --name-only "$BASE_SHA...$HEAD_SHA"';

const gitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd: string, args: readonly string[]): void {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8", env: gitEnv },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")}`);
  }
}

function gitHead(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    env: gitEnv,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || "git rev-parse failed");
  }
  return result.stdout.trim();
}

function withRepo(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "cross-boundary-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCli(
  stdin: string,
  labels: string,
): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [checkScript], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, PR_LABELS: labels },
  });
  return { status: result.status, stderr: result.stderr };
}

function runWorkflowDiff(
  cwd: string,
  base: string,
  head: string,
  labels: string,
): { status: number | null; stderr: string } {
  const result = spawnSync(
    "bash",
    ["-c", `set -o pipefail; ${diffCommand} | node ${JSON.stringify(checkScript)}`],
    {
      cwd,
      encoding: "utf8",
      env: { ...gitEnv, BASE_SHA: base, HEAD_SHA: head, PR_LABELS: labels },
    },
  );
  return { status: result.status, stderr: result.stderr };
}

const bothPaths = "app/src/page.tsx\0shared/src/design-tokens.ts\0";

it("exits 1 when stdin names both trees", () => {
  const result = runCli(bothPaths, "[]");
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toContain(
    "This pull request changes both app/ and shared/.",
  );
  expect(result.stderr).toContain("app/src/page.tsx");
  expect(result.stderr).toContain("shared/src/design-tokens.ts");
});

it("exits 0 when PR_LABELS includes cross-boundary", () => {
  const result = runCli(bothPaths, '["cross-boundary"]');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).not.toContain("changes both");
});

it("exits non-zero when PR_LABELS is not JSON", () => {
  const result = runCli(bothPaths, "bug\ncross-boundary");
  expect(result.status, result.stderr).not.toBe(0);
  expect(result.stderr).toContain("PR_LABELS is not a JSON array of strings.");
});

it("fails a move from app/ to shared/", () => {
  withRepo((dir) => {
    git(dir, ["init", "-q"]);
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app/x.ts"), "export const x = 1;\n");
    git(dir, ["add", "app/x.ts"]);
    git(dir, ["commit", "-q", "-m", "add"]);
    const base = gitHead(dir);
    mkdirSync(join(dir, "shared"));
    git(dir, ["mv", "app/x.ts", "shared/x.ts"]);
    git(dir, ["commit", "-q", "-m", "move"]);
    const result = runWorkflowDiff(dir, base, gitHead(dir), "");
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("app/x.ts");
    expect(result.stderr).toContain("shared/x.ts");
  });
});

it("reads a path that contains a quote, a backslash, and a control character", () => {
  const odd = "app/a\"b\\c\t\u0001.ts";
  withRepo((dir) => {
    git(dir, ["init", "-q"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "empty"]);
    const base = gitHead(dir);
    mkdirSync(join(dir, "app"));
    mkdirSync(join(dir, "shared"));
    writeFileSync(join(dir, odd), "export const a = 1;\n");
    writeFileSync(join(dir, "shared/y.ts"), "export const s = 1;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "add"]);
    const result = runWorkflowDiff(dir, base, gitHead(dir), "");
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(odd);
    expect(result.stderr).toContain("shared/y.ts");
  });
});

it("fails when git diff fails", () => {
  withRepo((dir) => {
    git(dir, ["init", "-q"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "empty"]);
    const result = runWorkflowDiff(dir, "deadbeef", "deadbeef", "[]");
    expect(result.status).not.toBe(0);
  });
});

it("runs the NUL diff from the workflow", () => {
  const workflow = readFileSync(
    join(repoRoot, ".github/workflows/cross-boundary.yml"),
    "utf8",
  );
  expect(workflow).toContain(diffCommand);
  expect(workflow).toContain("set -o pipefail");
  expect(workflow).toContain("app-shared-boundary:");
  expect(workflow).toContain("contents: read");
  expect(workflow).not.toContain("pull-requests: read");
});

it("reads labels from a JSON array and trims each one", () => {
  expect(parseLabelList("")).toEqual([]);
  expect(parseLabelList("null")).toEqual([]);
  expect(parseLabelList('[\n  " cross-boundary ",\n  "bug"\n]')).toEqual([
    "cross-boundary",
    "bug",
  ]);
  expect(
    crossBoundaryFailure({
      files: [appFile, sharedFile],
      labels: parseLabelList('[" cross-boundary "]'),
    }),
  ).toBeUndefined();
});

it("rejects label text that is not a JSON array of strings", () => {
  expect(() => parseLabelList("bug\ncross-boundary\n")).toThrow(
    /PR_LABELS is not a JSON array of strings/,
  );
  expect(() => parseLabelList("[")).toThrow(
    /PR_LABELS is not a JSON array of strings/,
  );
  expect(() => parseLabelList("[1]")).toThrow(
    /PR_LABELS is not a JSON array of strings/,
  );
  expect(() => parseLabelList('{"name":"cross-boundary"}')).toThrow(
    /PR_LABELS is not a JSON array of strings/,
  );
});
