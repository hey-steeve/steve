import { realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classify } from "../src/jev.ts";
import type { ClassifyResult, EmergencyNumber } from "../src/types.ts";
import { triageCases, type TriageEvalCase } from "./cases.ts";
import {
  formatTriageReport,
  scoreTriage,
  triageGateFailed,
  type TriageSample,
} from "./metrics.ts";

const skipReport = "JEV_API_KEY is not set. Skipping triage eval.\n";

export type TriageEvalRun = {
  readonly exitCode: 0 | 1;
  readonly report: string;
  readonly gateFailed: boolean;
};

export function jevFetch(apiKey: string, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    return base(input, { ...init, headers });
  };
}

export async function evaluateTriage(input: {
  readonly cases: readonly TriageEvalCase[];
  readonly fetch: typeof fetch;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly now?: () => number;
}): Promise<TriageEvalRun> {
  const now = input.now ?? (() => performance.now());
  const samples: TriageSample[] = [];
  for (const item of input.cases) {
    const started = now();
    let result: ClassifyResult;
    try {
      result = await classify({
        state: item.state,
        fetch: input.fetch,
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      });
    } catch {
      result = { label: "need-info", reason: "network" };
    }
    const latencyMs = Math.max(0, Math.round(now() - started));
    samples.push({
      id: item.id,
      expected: item.label,
      predicted: result.label,
      expectedNumbers: item.numbers,
      predictedNumbers: callNumbers(result),
      latencyMs,
      fallback: isFallback(result),
    });
  }
  const metrics = scoreTriage(samples);
  const gateFailed = triageGateFailed(samples);
  return {
    exitCode: gateFailed ? 1 : 0,
    report: formatTriageReport(metrics, gateFailed, samples),
    gateFailed,
  };
}

export async function runTriageEval(input: {
  readonly key: string | undefined;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
  readonly cases?: readonly TriageEvalCase[];
  readonly now?: () => number;
  readonly reportPath?: string;
}): Promise<TriageEvalRun> {
  if (input.key === undefined) {
    return { exitCode: 0, report: skipReport, gateFailed: false };
  }
  const outcome = await evaluateTriage({
    cases: input.cases ?? triageCases,
    fetch: jevFetch(input.key, input.fetchImpl ?? fetch),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  if (input.reportPath !== undefined) {
    writeFileSync(input.reportPath, outcome.report);
  }
  return outcome;
}

function callNumbers(result: ClassifyResult): EmergencyNumber[] {
  if (!("calls" in result) || result.calls === undefined) {
    return [];
  }
  return result.calls.map((call) => call.number);
}

function isFallback(result: ClassifyResult): boolean {
  return (
    result.label === "need-info" &&
    (result.reason === "timeout" ||
      result.reason === "http" ||
      result.reason === "network" ||
      result.reason === "malformed")
  );
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}

function defaultReportPath(): string {
  return fileURLToPath(new URL("./last-report.txt", import.meta.url));
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
}

export function printThenSaveReport(
  report: string,
  reportPath: string | undefined,
  io: {
    readonly writeStdout: (text: string) => void;
    readonly save: (path: string, text: string) => void;
  } = {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    save: writeFileSync,
  },
): boolean {
  io.writeStdout(report);
  if (reportPath === undefined) {
    return true;
  }
  try {
    io.save(reportPath, report);
    return true;
  } catch {
    return false;
  }
}

async function runCli(): Promise<void> {
  try {
    const model = readEnv("JEV_MODEL");
    const key = readEnv("JEV_API_KEY");
    const outcome = await runTriageEval({
      key,
      ...(model === undefined ? {} : { model }),
    });
    const reportPath = key === undefined ? undefined : (readEnv("TRIAGE_EVAL_REPORT") ?? defaultReportPath());
    const saved = printThenSaveReport(outcome.report, reportPath);
    if (!saved) {
      process.stderr.write("failed to write the triage eval report\n");
      process.exitCode = 1;
      return;
    }
    process.exitCode = outcome.exitCode;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "triage eval failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (isCliEntry()) {
  void runCli();
}
