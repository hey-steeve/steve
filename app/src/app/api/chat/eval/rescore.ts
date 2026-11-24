import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { emergencyCases } from "./cases.ts";
import { checkEmergencyReply, type EmergencyCheck } from "./check.ts";
import { evalExitCode, formatEvalSummary } from "./classify.ts";

const savedPreviewLimit = 400;
const truncationMark = "…";

const scoredLine =
  /^(\S+) (PASS|FAIL|ERROR) expected=\[([^\]]*)\] found=\[([^\]]*)\] (.*)$/;
const routeErrorLine = /^(\S+) ERROR(?: (.*))?$/;
const summaryLine = /^passed \d+\/\d+, failed \d+, errors \d+$/;

export type SavedEntry =
  | {
      readonly kind: "score";
      readonly id: string;
      readonly reply: string;
      readonly truncated: boolean;
    }
  | {
      readonly kind: "error";
      readonly id: string;
      readonly detail: string;
    };

export type RescoreReport = {
  readonly text: string;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly total: number;
};

export function parseSavedRun(text: string): readonly SavedEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: SavedEntry[] = [];
  let index = 0;
  while (index < lines.length) {
    const raw = lines[index];
    if (raw === undefined) {
      break;
    }
    const line = raw.trim();
    if (line.length === 0 || summaryLine.test(line)) {
      index += 1;
      continue;
    }
    const scored = scoredLine.exec(line);
    if (scored !== null) {
      const parsed = takeScoredEntry(scored, lines[index + 1] ?? "");
      index += 2;
      if (parsed !== undefined) {
        entries.push(parsed);
      }
      continue;
    }
    const routeError = routeErrorLine.exec(line);
    if (routeError !== null) {
      const id = routeError[1];
      if (id !== undefined) {
        entries.push({ kind: "error", id, detail: routeError[2] ?? "" });
      }
      index += 1;
      continue;
    }
    index += 1;
  }
  return entries;
}

function takeScoredEntry(
  scored: RegExpExecArray,
  reply: string,
): SavedEntry | undefined {
  const id = scored[1];
  const mark = scored[2];
  const detail = scored[5];
  if (id === undefined || mark === undefined || detail === undefined) {
    return undefined;
  }
  if (mark === "ERROR") {
    return { kind: "error", id, detail };
  }
  if (mark === "PASS" || mark === "FAIL") {
    return {
      kind: "score",
      id,
      reply,
      truncated: isTruncatedPreview(reply),
    };
  }
  return undefined;
}

function isTruncatedPreview(reply: string): boolean {
  return (
    reply.length === savedPreviewLimit + truncationMark.length &&
    reply.endsWith(truncationMark)
  );
}

export function rescoreSavedRun(text: string): RescoreReport {
  const entries = parseSavedRun(text);
  const lines: string[] = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;
  for (const entry of entries) {
    if (entry.kind === "error") {
      errors += 1;
      lines.push(formatErrorLine(entry.id, entry.detail));
      lines.push("");
      continue;
    }
    const item = emergencyCases.find((candidate) => candidate.id === entry.id);
    if (item === undefined) {
      errors += 1;
      lines.push(formatErrorLine(entry.id, "unknown case"));
      lines.push(entry.reply);
      lines.push("");
      continue;
    }
    const result = checkEmergencyReply(entry.reply, item.expected, {
      conditional15Allowed:
        "conditional15Allowed" in item && item.conditional15Allowed,
    });
    if (result.pass) {
      passed += 1;
    } else {
      failed += 1;
    }
    lines.push(formatScoreLine(entry.id, result, entry.truncated));
    lines.push(entry.reply);
    lines.push("");
  }
  const total = entries.length;
  lines.push(formatEvalSummary({ passed, failed, errors, total }));
  return {
    text: `${lines.join("\n")}\n`,
    passed,
    failed,
    errors,
    total,
  };
}

function formatErrorLine(id: string, detail: string): string {
  if (detail.length === 0) {
    return `${id} ERROR`;
  }
  return `${id} ERROR ${detail}`;
}

function formatScoreLine(
  id: string,
  result: EmergencyCheck,
  truncated: boolean,
): string {
  const mark = result.pass ? "PASS" : "FAIL";
  const tail = truncated ? " TRUNCATED" : "";
  return `${id} ${mark} expected=[${result.expected.join(",")}] found=[${result.found.join(",")}] ${result.reason}${tail}`;
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

function fileArg(): string | undefined {
  const args = process.argv.slice(2);
  const start = args[0] === "--" ? 1 : 0;
  const file = args[start];
  if (file === undefined || file.length === 0) {
    return undefined;
  }
  return file;
}

function runCli(): void {
  const file = fileArg();
  if (file === undefined) {
    process.stderr.write(
      "usage: node --import ./src/app/api/chat/eval/register.mjs ./src/app/api/chat/eval/rescore.ts <file>\n",
    );
    process.exitCode = 1;
    return;
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable file";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    return;
  }
  const report = rescoreSavedRun(text);
  process.stdout.write(report.text);
  process.exitCode = evalExitCode({
    scored: true,
    failed: report.failed,
    errors: report.errors,
  });
}

if (isCliEntry()) {
  runCli();
}
