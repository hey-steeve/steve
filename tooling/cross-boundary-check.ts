import { readFileSync } from "node:fs";
import { crossBoundaryFailure, parseLabelList } from "./cross-boundary.ts";

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

function filesFromStdin(): readonly string[] {
  const raw = readFileSync(0, "utf8");
  return raw.split(/\r?\n/).filter((line) => line.length > 0);
}

function run(): void {
  const labels = [
    ...parseLabelList(process.env["PR_LABELS"] ?? ""),
    ...labelsFromArgs(process.argv.slice(2)),
  ];
  const message = crossBoundaryFailure({
    files: filesFromStdin(),
    labels,
  });
  if (message !== undefined) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

if (process.stdin.isTTY) {
  process.stderr.write(
    "Pipe git diff --name-only base...head into this command.\n",
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
