import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { emergencyCases } from "./cases.ts";
import {
  checkEmergencyReply,
  decodeSavedReply,
  type EmergencyCheck,
} from "./check.ts";
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
      const mark = scored[2];
      const next = lines[index + 1];
      if ((mark === "PASS" || mark === "FAIL") && !isReplyLine(next)) {
        const id = scored[1];
        if (id !== undefined) {
          entries.push({ kind: "error", id, detail: "missing reply" });
        }
        index += 1;
        continue;
      }
      const parsed = takeScoredEntry(scored, next ?? "");
      index += isReplyLine(next) ? 2 : 1;
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

function isReplyLine(line: string | undefined): line is string {
  if (line === undefined) {
    return false;
  }
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return (
    !scoredLine.test(trimmed) &&
    !routeErrorLine.test(trimmed) &&
    !summaryLine.test(trimmed)
  );
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
    if (entry.truncated) {
      errors += 1;
      lines.push(formatErrorLine(entry.id, "truncated reply"));
      lines.push(entry.reply);
      lines.push("");
      continue;
    }
    const reply = decodeSavedReply(entry.reply);
    const result = checkEmergencyReply(reply, item.expected, {
      conditional15Allowed:
        "conditional15Allowed" in item && item.conditional15Allowed,
      optional3114Allowed:
        "optional3114Allowed" in item && item.optional3114Allowed,
      optional15Allowed: "optional15Allowed" in item && item.optional15Allowed,
      forbidMedication: "forbidMedication" in item && item.forbidMedication,
    });
    if (result.pass) {
      passed += 1;
    } else {
      failed += 1;
    }
    lines.push(formatScoreLine(entry.id, result));
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

function formatScoreLine(id: string, result: EmergencyCheck): string {
  const mark = result.pass ? "PASS" : "FAIL";
  return `${id} ${mark} expected=[${result.expected.join(",")}] found=[${result.found.join(",")}] ${result.reason}`;
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

function fileArgs(): string[] {
  const args = process.argv.slice(2);
  const start = args[0] === "--" ? 1 : 0;
  return args.slice(start).filter((file) => file.length > 0);
}

function runCli(): void {
  const files = fileArgs();
  if (files.length === 0) {
    process.stderr.write(
      "usage: node --import ./src/app/api/chat/eval/register.mjs ./src/app/api/chat/eval/rescore.ts <file> [file...]\n",
    );
    process.exitCode = 1;
    return;
  }
  let exitCode: 0 | 1 = 0;
  for (const file of files) {
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
    if (
      evalExitCode({
        scored: true,
        failed: report.failed,
        errors: report.errors,
      }) === 1
    ) {
      exitCode = 1;
    }
  }
  process.exitCode = exitCode;
}

if (isCliEntry()) {
  runCli();
}
