import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openRouterModel } from "../openrouter-model.ts";

// Must equal `defaultModel` in the chat route. header.test.ts pins that.
export const defaultRunModel = "openai/gpt-6.1-terra";

const headerTimeZone = "Europe/Paris";
const unavailable = "unavailable";

export type GitReader = (args: readonly string[]) => string | undefined;

export function formatParisTime(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: headerTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "??";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}:${part("second")}`;
  return `${date} ${time} ${headerTimeZone}`;
}

// Runs git inside the repo that holds this file. It returns undefined when git is
// missing or the command fails, so the header says "unavailable" and invents nothing.
export function readGit(args: readonly string[]): string | undefined {
  try {
    const output = execFileSync("git", [...args], {
      cwd: fileURLToPath(new URL(".", import.meta.url)),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    return output.length > 0 ? output : undefined;
  } catch {
    return undefined;
  }
}

function branchName(git: GitReader): string {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === undefined) {
    return unavailable;
  }
  return branch === "HEAD" ? "detached" : branch;
}

// The only env value read is the model id. It follows the route: a trimmed
// OPENROUTER_MODEL in provider/model form, otherwise the route default.
export function runHeaderLines(input: {
  readonly now: Date;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly git: GitReader;
}): string[] {
  const { now, env, git } = input;
  const configured = env["OPENROUTER_MODEL"]?.trim();
  const model = openRouterModel(
    configured === undefined || configured.length === 0 ? undefined : configured,
    defaultRunModel,
  );
  return [
    `# date: ${formatParisTime(now)}`,
    `# branch: ${branchName(git)}`,
    `# head: ${git(["rev-parse", "HEAD"]) ?? unavailable}`,
    `# model: ${model}`,
  ];
}
