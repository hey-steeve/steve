import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  crossBoundaryFailure,
  parseLabelList,
  type CrossBoundaryInput,
} from "./cross-boundary.ts";

function labelsFromArgs(argv: readonly string[]): readonly string[] {
  const labels: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== "--label") {
      throw new Error(`Unknown argument: ${arg ?? ""}.`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("--label needs a value.");
    }
    labels.push(value);
    index += 1;
  }
  return labels;
}

export function parseCrossBoundaryInput(
  stdin: string,
  labelsRaw: string,
): CrossBoundaryInput {
  return {
    files: stdin.split("\0").filter((file) => file.length > 0),
    labels: parseLabelList(labelsRaw),
  };
}

function run(): void {
  const input = parseCrossBoundaryInput(
    readFileSync(0, "utf8"),
    process.env["PR_LABELS"] ?? "",
  );
  const message = crossBoundaryFailure({
    files: input.files,
    labels: [...input.labels, ...labelsFromArgs(process.argv.slice(2))],
  });
  if (message !== undefined) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isCliEntry()) {
  if (process.stdin.isTTY) {
    process.stderr.write(
      "Pipe git diff -z --no-renames --name-only base...head into this command.\n",
    );
    process.stderr.write(
      "Pass --label cross-boundary when the mix is intentional.\n",
    );
    process.exit(1);
  }

  try {
    run();
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Cross-boundary check failed.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
