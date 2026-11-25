import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  defaultRunModel,
  formatParisTime,
  runHeaderLines,
  type GitReader,
} from "./header.ts";

const sha = "f5c1412a0b9d8e7c6b5a4f3e2d1c0b9a8f7e6d5c";

function fakeGit(branch: string | undefined, head: string | undefined): GitReader {
  return (args) => {
    if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
      return branch;
    }
    if (args.join(" ") === "rev-parse HEAD") {
      return head;
    }
    return undefined;
  };
}

const winter = new Date("2026-01-15T12:00:00Z");
const summer = new Date("2026-07-15T12:00:00Z");

it("formats the local Paris time with the Europe/Paris label", () => {
  expect(formatParisTime(winter)).toBe("2026-01-15 13:00:00 Europe/Paris");
  expect(formatParisTime(summer)).toBe("2026-07-15 14:00:00 Europe/Paris");
});

it("writes date, branch, head, and model in that order", () => {
  expect(
    runHeaderLines({
      now: winter,
      env: { OPENROUTER_MODEL: "openai/gpt-6.1-sol" },
      git: fakeGit("fix/prompt-live-calls", sha),
    }),
  ).toEqual([
    "# date: 2026-01-15 13:00:00 Europe/Paris",
    "# branch: fix/prompt-live-calls",
    `# head: ${sha}`,
    "# model: openai/gpt-6.1-sol",
  ]);
});

it("uses the route default model when OPENROUTER_MODEL is unset, empty, or blank", () => {
  for (const env of [{}, { OPENROUTER_MODEL: "" }, { OPENROUTER_MODEL: "  \t " }]) {
    const lines = runHeaderLines({ now: winter, env, git: fakeGit("main", sha) });
    expect(lines[3]).toBe(`# model: ${defaultRunModel}`);
  }
  expect(defaultRunModel).toBe("openai/gpt-6.1-terra");
});

it("reports the model the route would use when the env value is not provider/model", () => {
  const lines = runHeaderLines({
    now: winter,
    env: { OPENROUTER_MODEL: "not a model" },
    git: fakeGit("main", sha),
  });
  expect(lines[3]).toBe(`# model: ${defaultRunModel}`);
  const trimmed = runHeaderLines({
    now: winter,
    env: { OPENROUTER_MODEL: " openai/gpt-6.1-sol " },
    git: fakeGit("main", sha),
  });
  expect(trimmed[3]).toBe("# model: openai/gpt-6.1-sol");
});

it("keeps the default model equal to the route default", () => {
  const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");
  expect(route).toContain(`const defaultModel = "${defaultRunModel}";`);
});

it("marks git fields as unavailable and still writes date and model", () => {
  const lines = runHeaderLines({
    now: winter,
    env: {},
    git: fakeGit(undefined, undefined),
  });
  expect(lines).toEqual([
    "# date: 2026-01-15 13:00:00 Europe/Paris",
    "# branch: unavailable",
    "# head: unavailable",
    `# model: ${defaultRunModel}`,
  ]);
});

it("names a detached HEAD instead of the word HEAD", () => {
  const lines = runHeaderLines({ now: winter, env: {}, git: fakeGit("HEAD", sha) });
  expect(lines[1]).toBe("# branch: detached");
});

it("never prints an env value other than the model id", () => {
  const lines = runHeaderLines({
    now: winter,
    env: {
      OPENROUTER_API_KEY: "sk-or-secret-value",
      OPENROUTER_MODEL: "openai/gpt-6.1-sol",
      STEVE_CHAT_LIVE: "1",
    },
    git: fakeGit("main", sha),
  });
  const text = lines.join("\n");
  expect(text).not.toContain("sk-or-secret-value");
  expect(text).not.toContain("STEVE_CHAT_LIVE");
  expect(lines).toHaveLength(4);
});
