import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";
import { emergencyCases } from "../app/src/app/api/chat/eval/cases.ts";
import {
  evalExitCode,
  type EvalStatus,
} from "../app/src/app/api/chat/eval/classify.ts";
import {
  checkEmergencyReply,
  type EmergencyCheckOptions,
  type EmergencyNumber,
} from "../app/src/app/api/chat/eval/check.ts";
import {
  call15Now,
  call3114,
  call3114Now,
  ensureEmergencyCalls,
  type EmergencyCall,
  refusal112,
} from "../app/src/app/api/chat/emergency-templates.ts";
import { triageCases } from "../features/triage/eval/cases.ts";
import { triageGateFailed, type TriageSample } from "../features/triage/eval/metrics.ts";
import { classify } from "../features/triage/src/jev.ts";
import { triageTurn } from "../features/triage/src/triage-turn.ts";
import type {
  ClassifyResult,
  EmergencyNumber as TriageNumber,
} from "../features/triage/src/types.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(root, "docs/safety-rules.md");

const tableOpen = "<!-- safety-rules:ids -->";
const tableClose = "<!-- /safety-rules:ids -->";
const tableHeader = "| ID | Rule | Enforcement | Verified by |";
const tableRule = "| --- | --- | --- | --- |";

const riskLevels = new Set(["critical", "concerning", "safe"]);
const enforcementLevels = new Set(["checked", "prompt-only", "advisory"]);

type SuiteName = "chat" | "triage";

type ParsedCase = {
  readonly id: string;
  readonly risk: string | undefined;
  readonly safe: readonly string[];
};

type RuleRow = {
  readonly id: string;
  readonly rule: string;
  readonly enforcement: string;
  readonly verifiedBy: readonly string[];
};

type ClassifyReject =
  | {
      readonly kind: "need-info";
      readonly reason:
        | "malformed"
        | "no-channel"
        | "below-threshold"
        | "network"
        | "timeout"
        | "http";
    }
  | {
      readonly kind: "top-label-rejected";
      readonly calls: readonly EmergencyNumber[];
    }
  | { readonly kind: "offer-3114-only" };

type ProductionFn =
  | "classify"
  | "triageGateFailed"
  | "checkEmergencyReply"
  | "ensureEmergencyCalls"
  | "triageTurn"
  | "evalExitCode";

type PayloadLoad = () => Response | Promise<Response>;

type ClassifyProbe = {
  readonly reject: ClassifyReject;
  readonly fetch: typeof fetch;
  readonly timeoutMs?: number;
};

type GuardExample = {
  readonly through?: readonly ProductionFn[];
  readonly reply?: string;
  readonly expected?: readonly EmergencyNumber[];
  readonly reason?: string;
  readonly options?: EmergencyCheckOptions;
  readonly samples?: readonly TriageSample[];
  readonly status?: EvalStatus;
  readonly calls?: readonly EmergencyCall[];
  // triageTurn: the earlier user turns, oldest first, and the sentence that must reach the state.
  readonly earlierTurns?: readonly string[];
  readonly mustReach?: string;
  readonly probes?: readonly ClassifyProbe[];
  readonly loads?: readonly PayloadLoad[];
  readonly expectedNumbers?: readonly TriageNumber[];
  readonly defaultTimeoutMs?: number;
};

type CheckedExample =
  | {
      readonly through: readonly ["checkEmergencyReply"];
      readonly reply: string;
      readonly expected: readonly EmergencyNumber[];
      readonly reason: string;
      readonly options?: EmergencyCheckOptions;
    }
  | { readonly through: readonly ["triageGateFailed"]; readonly samples: readonly TriageSample[] }
  | { readonly through: readonly ["evalExitCode"]; readonly status: EvalStatus }
  | {
      readonly through: readonly ["ensureEmergencyCalls"];
      readonly reply: string;
      readonly calls: readonly EmergencyCall[];
    }
  | {
      readonly through: readonly ["triageTurn"];
      readonly earlierTurns: readonly string[];
      readonly mustReach: string;
    }
  | {
      readonly through: readonly ["classify"];
      readonly probes: readonly ClassifyProbe[];
      readonly defaultTimeoutMs?: number;
    }
  | {
      readonly through: readonly ["classify", "triageGateFailed"];
      readonly expectedNumbers: readonly TriageNumber[];
      readonly loads: readonly PayloadLoad[];
    };

const labelNames = ["emergency", "consult", "self-care", "need-info"] as const;
const channelNames = ["physical", "psychological", "both", "none"] as const;

const fixedGateSample: TriageSample = {
  expected: "emergency",
  predicted: "emergency",
  expectedNumbers: ["3114", "15"],
  predictedNumbers: ["15", "3114"],
  latencyMs: 1,
  fallback: false,
};

it("maps every SAFE id in the doc to a case or test, and every case to a SAFE id", async () => {
  const problems: string[] = [];
  const rows = parseRuleTable(readFileSync(docPath, "utf8"), problems);
  const chat = emergencyCases.map(taggedCase);
  const triage = triageCases.map(taggedCase);
  const bySuite: Record<SuiteName, ReadonlyMap<string, ParsedCase>> = {
    chat: indexCases(chat, "chat", problems),
    triage: indexCases(triage, "triage", problems),
  };
  const rowById = indexRows(rows, problems);
  checkContiguousIds(rows, problems);
  for (const row of rows) {
    checkRowVerifiers(row, bySuite, problems);
  }
  checkCases(chat, "chat", rowById, problems);
  checkCases(triage, "triage", rowById, problems);
  await checkCheckedExamples(rows, checkedExamples(), problems);
  expect(problems, problems.join("\n")).toEqual([]);
});

it("rejects a checked row that has no rejecting example", async () => {
  const problems: string[] = [];
  await checkCheckedExamples([checkedRow("SAFE-13")], new Map(), problems);
  expect(problems.some((problem) => problem.includes("no rejecting example"))).toBe(true);
});

it("rejects a checked example the reply checker accepts", async () => {
  const problems: string[] = [];
  const examples = new Map<string, CheckedExample>([
    ["SAFE-13", replyExample("Appelle le 15 maintenant.", ["15"], "numbers")],
  ]);
  await checkCheckedExamples([checkedRow("SAFE-13")], examples, problems);
  expect(problems.some((problem) => problem.includes("was accepted"))).toBe(true);
});

it("rejects a case whose SAFE id list is empty", () => {
  const problems: string[] = [];
  checkCases(
    [{ id: "untagged-x", risk: "safe", safe: [] }],
    "chat",
    new Map(),
    problems,
  );
  expect(problems.some((problem) => problem.includes("no SAFE id"))).toBe(true);
});

it("rejects a choice payload whose probabilities sum to 1.7", () => {
  const skewed = splitProbabilities(labelNames, "consult", 0.7);
  skewed["diagnosis"] = 0.7;
  const problems = payloadProbabilityProblems({
    answers: { label: choiceAnswer("diagnosis", skewed) },
  });
  expect(problems.some((problem) => problem.includes("sum to"))).toBe(true);
});

it("keeps every coverage stub on a valid probability distribution", () => {
  checkedExamples();
  const problems = stubPayloads.flatMap((payload, index) =>
    payloadProbabilityProblems(payload).map((problem) => `payload ${index}: ${problem}`),
  );
  expect(problems).toEqual([]);
});

it("rejects a classify row whose example passes fixed arrays to the gate", async () => {
  const rowId = jevCallOrderIds[0];
  const passedToGate: GuardExample = {
    through: jevCallOrderThrough,
    samples: [fixedGateSample],
  };
  const classifyOnly: GuardExample = {
    through: ["classify"],
    samples: [fixedGateSample],
  };
  expect(declaredFunctionGap(passedToGate) ?? "").toContain("never calls classify");
  expect(declaredFunctionGap(classifyOnly) ?? "").toContain("never calls classify");
  const problems: string[] = [];
  await checkCheckedExamples(
    [checkedRow(rowId)],
    new Map([[rowId, passedToGate]]),
    problems,
  );
  expect(problems.some((problem) => problem.includes("never calls classify"))).toBe(true);
});

function checkedRow(id: string): RuleRow {
  return {
    id,
    rule: "opens with Appelle le 15 maintenant.",
    enforcement: "checked",
    verifiedBy: [],
  };
}

function taggedCase(item: {
  readonly id: string;
  readonly risk: string;
  readonly safe: readonly string[];
}): ParsedCase {
  return { id: item.id, risk: item.risk, safe: item.safe };
}

function parseRuleTable(source: string, problems: string[]): RuleRow[] {
  const lines = source.split("\n");
  const opens = lineNumbers(lines, tableOpen);
  const closes = lineNumbers(lines, tableClose);
  const openAt = opens[0];
  const closeAt = closes[0];
  const fenceOk =
    opens.length === 1 &&
    closes.length === 1 &&
    openAt !== undefined &&
    closeAt !== undefined &&
    closeAt > openAt;
  if (!fenceOk) {
    problems.push(
      `docs/safety-rules.md must contain one line ${tableOpen} before one line ${tableClose}. A mention inside a sentence does not count.`,
    );
    return [];
  }
  const body = lines.slice(openAt + 1, closeAt).join("\n");
  const tableLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (tableLines[0] !== tableHeader || tableLines[1] !== tableRule) {
    problems.push(
      `The ID table must start with ${tableHeader} and ${tableRule}. The coverage test parses only that table.`,
    );
    return [];
  }
  const rows: RuleRow[] = [];
  for (const line of tableLines.slice(2)) {
    const match = /^\| (SAFE-\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/.exec(line);
    if (match === null) {
      problems.push(`Unreadable ID table row: ${line}`);
      continue;
    }
    const id = match[1] ?? "";
    const rule = (match[2] ?? "").trim();
    const enforcement = (match[3] ?? "").trim();
    const verifiedBy = (match[4] ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (rule.length === 0) {
      problems.push(`${id} has an empty rule.`);
    }
    if (!enforcementLevels.has(enforcement)) {
      problems.push(
        `${id} has enforcement "${enforcement}". Use checked, prompt-only, or advisory.`,
      );
    }
    if (verifiedBy.length === 0) {
      problems.push(`${id} has an empty Verified by cell.`);
    }
    rows.push({ id, rule, enforcement, verifiedBy });
  }
  return rows;
}

function lineNumbers(lines: readonly string[], marker: string): number[] {
  const found: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() === marker) {
      found.push(index);
    }
  }
  return found;
}

function indexCases(
  cases: readonly ParsedCase[],
  suite: SuiteName,
  problems: string[],
): Map<string, ParsedCase> {
  const byId = new Map<string, ParsedCase>();
  for (const item of cases) {
    if (byId.has(item.id)) {
      problems.push(`${suite} case id ${item.id} is duplicated.`);
      continue;
    }
    byId.set(item.id, item);
  }
  return byId;
}

function indexRows(rows: readonly RuleRow[], problems: string[]): Map<string, RuleRow> {
  const byId = new Map<string, RuleRow>();
  for (const row of rows) {
    if (byId.has(row.id)) {
      problems.push(`${row.id} appears more than once in docs/safety-rules.md.`);
      continue;
    }
    byId.set(row.id, row);
  }
  return byId;
}

function checkContiguousIds(rows: readonly RuleRow[], problems: string[]): void {
  if (rows.length === 0) {
    return;
  }
  const numbers = rows.map((row) => Number(row.id.slice("SAFE-".length)));
  if (numbers[0] !== 1) {
    problems.push(`SAFE ids must start at SAFE-01. The table starts at ${rows[0]?.id}.`);
  }
  for (let index = 1; index < numbers.length; index += 1) {
    const previous = numbers[index - 1];
    const current = numbers[index];
    if (previous === undefined || current === undefined || current !== previous + 1) {
      problems.push(
        `SAFE ids have a gap before ${rows[index]?.id}. Ids must be SAFE-01, SAFE-02, and so on, with no gaps.`,
      );
    }
  }
}

function checkRowVerifiers(
  row: RuleRow,
  bySuite: Record<SuiteName, ReadonlyMap<string, ParsedCase>>,
  problems: string[],
): void {
  let verified = 0;
  for (const token of row.verifiedBy) {
    const chat = /^chat:([a-z0-9-]+)$/.exec(token);
    const triage = /^triage:([a-z0-9-]+)$/.exec(token);
    const testFile = /^test:([A-Za-z0-9_./-]+)$/.exec(token);
    if (chat !== null) {
      verified += linkCase(row.id, "chat", chat[1] ?? "", bySuite.chat, problems);
      continue;
    }
    if (triage !== null) {
      verified += linkCase(row.id, "triage", triage[1] ?? "", bySuite.triage, problems);
      continue;
    }
    if (testFile !== null) {
      const relative = testFile[1] ?? "";
      if (relative.startsWith("/") || relative.includes("..")) {
        problems.push(`${row.id} test path must stay inside the repo: ${relative}`);
        continue;
      }
      if (!existsSync(join(root, relative))) {
        problems.push(`${row.id} lists missing test file ${relative}.`);
        continue;
      }
      verified += 1;
      continue;
    }
    problems.push(
      `${row.id} has Verified by token "${token}". Use chat:<id>, triage:<id>, or test:<path>.`,
    );
  }
  if (row.verifiedBy.length > 0 && verified === 0) {
    problems.push(`${row.id} has no verifying case or test.`);
  }
}

function linkCase(
  ruleId: string,
  suite: SuiteName,
  caseId: string,
  cases: ReadonlyMap<string, ParsedCase>,
  problems: string[],
): number {
  const item = cases.get(caseId);
  if (item === undefined) {
    problems.push(`${ruleId} lists ${suite} case ${caseId}, which is not in the case file.`);
    return 0;
  }
  if (!item.safe.includes(ruleId)) {
    problems.push(
      `${ruleId} lists ${suite} case ${caseId}, but that case does not tag ${ruleId}.`,
    );
    return 0;
  }
  return 1;
}

function checkCases(
  cases: readonly ParsedCase[],
  suite: SuiteName,
  rowById: ReadonlyMap<string, RuleRow>,
  problems: string[],
): void {
  for (const item of cases) {
    if (item.risk === undefined) {
      problems.push(`${suite} case ${item.id} has no risk level.`);
    } else if (!riskLevels.has(item.risk)) {
      problems.push(
        `${suite} case ${item.id} has risk "${item.risk}". Use critical, concerning, or safe.`,
      );
    }
    if (item.safe.length === 0) {
      problems.push(`${suite} case ${item.id} has no SAFE id.`);
    }
    for (const ruleId of item.safe) {
      if (!/^SAFE-\d{2}$/.test(ruleId)) {
        problems.push(`${suite} case ${item.id} has malformed SAFE id ${ruleId}.`);
        continue;
      }
      const row = rowById.get(ruleId);
      if (row === undefined) {
        problems.push(
          `${suite} case ${item.id} tags ${ruleId}, which is not in docs/safety-rules.md.`,
        );
        continue;
      }
      const token = `${suite}:${item.id}`;
      if (!row.verifiedBy.includes(token)) {
        problems.push(
          `${suite} case ${item.id} tags ${ruleId}, but the ${ruleId} row does not list ${token}.`,
        );
      }
    }
  }
}

async function checkCheckedExamples<Example extends GuardExample>(
  rows: readonly RuleRow[],
  examples: ReadonlyMap<string, Example>,
  problems: string[],
): Promise<void> {
  const checked = new Set(
    rows.filter((row) => row.enforcement === "checked").map((row) => row.id),
  );
  for (const id of checked) {
    if (!examples.has(id)) {
      problems.push(`${id} is checked and has no rejecting example.`);
    }
  }
  for (const id of examples.keys()) {
    if (!checked.has(id)) {
      problems.push(`${id} has a rejecting example but its row is not checked.`);
    }
  }
  for (const [id, example] of examples) {
    if (!checked.has(id)) {
      continue;
    }
    const problem = await exampleProblem(example);
    if (problem !== undefined) {
      problems.push(`${id} ${problem}`);
    }
  }
}

function declaredFunctionGap(example: GuardExample): string | undefined {
  const through = example.through;
  if (through === undefined || through.length === 0) {
    return "declares no production function.";
  }
  const wantsClassify = through.includes("classify");
  const wantsGate = through.includes("triageGateFailed");
  const hasLoads = example.loads !== undefined && example.loads.length > 0;
  const hasProbes = example.probes !== undefined && example.probes.length > 0;
  const hasSamples = example.samples !== undefined;
  const hasClassifyCall = hasLoads || hasProbes || example.defaultTimeoutMs !== undefined;
  if (wantsClassify && hasSamples) {
    return "declares classify but the example never calls classify.";
  }
  if (wantsClassify && !hasClassifyCall) {
    return "declares classify but the example never calls classify.";
  }
  if (wantsClassify && wantsGate && example.expectedNumbers === undefined) {
    return "declares classify but the example never calls classify.";
  }
  if (wantsGate && !wantsClassify && !hasSamples) {
    return "declares triageGateFailed but the example never calls it.";
  }
  if (
    through.includes("checkEmergencyReply") &&
    (example.reply === undefined || example.expected === undefined || example.reason === undefined)
  ) {
    return "declares checkEmergencyReply but the example never calls it.";
  }
  if (through.includes("evalExitCode") && example.status === undefined) {
    return "declares evalExitCode but the example never calls it.";
  }
  if (
    through.includes("ensureEmergencyCalls") &&
    (example.reply === undefined || example.calls === undefined)
  ) {
    return "declares ensureEmergencyCalls but the example never calls it.";
  }
  if (
    through.includes("triageTurn") &&
    (example.earlierTurns === undefined || example.mustReach === undefined)
  ) {
    return "declares triageTurn but the example never calls it.";
  }
  return undefined;
}

async function exampleProblem(example: GuardExample): Promise<string | undefined> {
  const gap = declaredFunctionGap(example);
  if (gap !== undefined) {
    return gap;
  }
  if (sameThrough(example, ["classify", "triageGateFailed"])) {
    return classifyGateProblem(example);
  }
  if (sameThrough(example, ["classify"])) {
    return classifyProbesProblem(example);
  }
  if (sameThrough(example, ["checkEmergencyReply"])) {
    return replyProblem(example);
  }
  if (sameThrough(example, ["triageGateFailed"])) {
    return gateProblem(example);
  }
  if (sameThrough(example, ["evalExitCode"])) {
    return exitProblem(example);
  }
  if (sameThrough(example, ["ensureEmergencyCalls"])) {
    return ensureProblem(example);
  }
  if (sameThrough(example, ["triageTurn"])) {
    return stateWindowProblem(example);
  }
  return "declares no production function.";
}

function sameThrough(example: GuardExample, names: readonly ProductionFn[]): boolean {
  const through = example.through;
  if (through === undefined || through.length !== names.length) {
    return false;
  }
  return names.every((name, index) => through[index] === name);
}

async function classifyGateProblem(example: GuardExample): Promise<string | undefined> {
  const loads = example.loads;
  const expectedNumbers = example.expectedNumbers;
  if (loads === undefined || loads.length === 0 || expectedNumbers === undefined) {
    return "declares classify but the example never calls classify.";
  }
  for (const load of loads) {
    const result = await classify({
      state: "safety-rules example",
      timeoutMs: 50,
      fetch: async () => load(),
    });
    const predictedNumbers = callNumbers(result);
    const failed = triageGateFailed([
      {
        expected: "emergency",
        predicted: result.label,
        expectedNumbers,
        predictedNumbers,
        latencyMs: 1,
        fallback: false,
      },
    ]);
    if (failed) {
      return `gate failed after classify returned ${formatResult(result)}.`;
    }
  }
  return undefined;
}

async function classifyProbesProblem(example: GuardExample): Promise<string | undefined> {
  if (example.defaultTimeoutMs !== undefined) {
    const timeoutProblem = await defaultTimeoutProblem(example.defaultTimeoutMs);
    if (timeoutProblem !== undefined) {
      return timeoutProblem;
    }
  }
  for (const probe of example.probes ?? []) {
    const result = await classify({
      state: "safety-rules example",
      timeoutMs: probe.timeoutMs ?? 50,
      fetch: probe.fetch,
    });
    if (!classifyRejected(probe.reject, result)) {
      return `classify returned ${formatResult(result)}, expected ${formatReject(probe.reject)}.`;
    }
  }
  return undefined;
}

async function defaultTimeoutProblem(timeoutMs: number): Promise<string | undefined> {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    const result = await classify({
      state: "safety-rules example",
      fetch: async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    });
    const armed = timeout.mock.calls.some((call) => call[0] === timeoutMs);
    if (!armed) {
      return `classify did not arm a ${timeoutMs} ms timeout.`;
    }
    if (!(result.label === "need-info" && result.reason === "timeout" && !("calls" in result))) {
      return `classify timeout returned ${formatResult(result)}.`;
    }
    return undefined;
  } finally {
    timeout.mockRestore();
  }
}

function replyProblem(example: GuardExample): string | undefined {
  if (example.reply === undefined || example.expected === undefined || example.reason === undefined) {
    return "declares checkEmergencyReply but the example never calls it.";
  }
  const result =
    example.options === undefined
      ? checkEmergencyReply(example.reply, example.expected)
      : checkEmergencyReply(example.reply, example.expected, example.options);
  if (result.pass) {
    return "example was accepted by the checker.";
  }
  if (result.reason !== example.reason) {
    return `reason was ${result.reason}, expected ${example.reason}.`;
  }
  return undefined;
}

function gateProblem(example: GuardExample): string | undefined {
  const samples = example.samples;
  if (samples === undefined) {
    return "declares triageGateFailed but the example never calls it.";
  }
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample === undefined) {
      continue;
    }
    if (!triageGateFailed([sample])) {
      return `gate accepted sample ${index}.`;
    }
  }
  return undefined;
}

function exitProblem(example: GuardExample): string | undefined {
  if (example.status === undefined) {
    return "declares evalExitCode but the example never calls it.";
  }
  const code = evalExitCode(example.status);
  if (code !== 1) {
    return `evalExitCode returned ${code}.`;
  }
  return undefined;
}

function ensureProblem(example: GuardExample): string | undefined {
  if (example.reply === undefined || example.calls === undefined) {
    return "declares ensureEmergencyCalls but the example never calls it.";
  }
  const next = ensureEmergencyCalls(example.reply, example.calls);
  const prefix = `${call3114Now} ${call15Now}`;
  if (next !== example.reply && next.startsWith(prefix)) {
    return undefined;
  }
  return "ensureEmergencyCalls did not prefix 3114 then 15.";
}

async function stateWindowProblem(example: GuardExample): Promise<string | undefined> {
  const turns = [...(example.earlierTurns ?? []), "Message actuel."].map((text, index) => ({
    sessionId: "safety-rules",
    turnId: `turn-${index}`,
    channel: "text" as const,
    text,
  }));
  const current = turns[turns.length - 1];
  if (current === undefined || example.mustReach === undefined) {
    return "declares triageTurn but the example never calls it.";
  }
  let seen = "";
  await triageTurn({
    handoff: {
      sessionId: current.sessionId,
      turnId: current.turnId,
      target: "triage",
      intent: "care_request",
      data: turns,
    },
    classify: async ({ state }) => {
      seen = state;
      return { label: "self-care", probability: 0.7 };
    },
  });
  return seen.includes(example.mustReach)
    ? undefined
    : "triageTurn dropped the earlier risk sentence from the classifier state.";
}

function classifyRejected(reject: ClassifyReject, result: ClassifyResult): boolean {
  if (reject.kind === "need-info") {
    return result.label === "need-info" && result.reason === reject.reason && !("calls" in result);
  }
  if (reject.kind === "top-label-rejected") {
    if (result.label !== "emergency") {
      return false;
    }
    return sameCallNumbers(result.calls, reject.calls);
  }
  if (result.label === "emergency" || !("calls" in result) || result.calls === undefined) {
    return false;
  }
  return sameCallNumbers(result.calls, ["3114"]);
}

function sameCallNumbers(
  calls: readonly { readonly number: string }[],
  expected: readonly string[],
): boolean {
  if (calls.length !== expected.length) {
    return false;
  }
  return calls.every((call, index) => call.number === expected[index]);
}

function callNumbers(result: ClassifyResult): TriageNumber[] {
  if (!("calls" in result) || result.calls === undefined) {
    return [];
  }
  return result.calls.map((call) => call.number);
}

function formatResult(result: ClassifyResult): string {
  const calls = callNumbers(result);
  const callText = calls.length === 0 ? "" : ` ${calls.join(",")}`;
  if ("reason" in result) {
    return `${result.label} ${result.reason}${callText}`;
  }
  return `${result.label}${callText}`;
}

function formatReject(reject: ClassifyReject): string {
  if (reject.kind === "need-info") {
    return `need-info ${reject.reason}`;
  }
  if (reject.kind === "top-label-rejected") {
    return `emergency ${reject.calls.join(",")}`;
  }
  return "3114 only";
}

function replyExample(
  reply: string,
  expected: readonly EmergencyNumber[],
  reason: string,
  options?: EmergencyCheckOptions,
): CheckedExample {
  if (options === undefined) {
    return { through: ["checkEmergencyReply"], reply, expected, reason };
  }
  return { through: ["checkEmergencyReply"], reply, expected, reason, options };
}

function gateExample(samples: readonly TriageSample[]): CheckedExample {
  return { through: ["triageGateFailed"], samples };
}

function classifyExample(reject: ClassifyReject, load: PayloadLoad): CheckedExample {
  return {
    through: ["classify"],
    probes: [{ reject, fetch: async () => load() }],
  };
}

const jevCallOrderThrough = ["classify", "triageGateFailed"] as const;

const jevCallOrderIds = ["SAFE-05", "SAFE-06", "SAFE-07", "SAFE-08"] as const;

function orderExample(
  expectedNumbers: readonly TriageNumber[],
  loads: readonly PayloadLoad[],
): CheckedExample {
  return { through: jevCallOrderThrough, expectedNumbers, loads };
}

const stubPayloads: unknown[] = [];

function jsonPayload(payload: unknown): PayloadLoad {
  stubPayloads.push(payload);
  return () => Response.json(payload);
}

const probabilityTolerance = 1e-9;

function payloadProbabilityProblems(payload: unknown): string[] {
  const problems: string[] = [];
  walkChoiceAnswers(payload, problems);
  return problems;
}

function walkChoiceAnswers(value: unknown, problems: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkChoiceAnswers(item, problems);
    }
    return;
  }
  if (!isPlainRecord(value)) {
    return;
  }
  if (value["type"] === "choice") {
    const problem = choiceProbabilityProblem(value);
    if (problem !== undefined) {
      problems.push(problem);
    }
  }
  for (const child of Object.values(value)) {
    walkChoiceAnswers(child, problems);
  }
}

function choiceProbabilityProblem(answer: Record<string, unknown>): string | undefined {
  const choice = answer["choice"];
  const probabilities = answer["probabilities"];
  if (typeof choice !== "string" || !isPlainRecord(probabilities)) {
    return "choice answer has no probability map";
  }
  if (!(choice in probabilities)) {
    return `choice ${choice} has no probability`;
  }
  let sum = 0;
  for (const value of Object.values(probabilities)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return "probability is not a finite non-negative number";
    }
    sum += value;
  }
  if (Math.abs(sum - 1) > probabilityTolerance) {
    return `probabilities sum to ${sum}`;
  }
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function splitProbabilities(
  options: readonly string[],
  selected: string,
  selectedP: number,
): Record<string, number> {
  const rest = (1 - selectedP) / (options.length - 1);
  const probabilities: Record<string, number> = {};
  for (const option of options) {
    probabilities[option] = option === selected ? selectedP : rest;
  }
  return probabilities;
}

function choiceAnswer(
  choice: string,
  probabilities: Record<string, number>,
): {
  readonly type: "choice";
  readonly choice: string;
  readonly confidence: number;
  readonly probabilities: Record<string, number>;
} {
  return { type: "choice", choice, confidence: 0.2, probabilities };
}

function labelProbabilities(input: {
  readonly label: string;
  readonly labelP: number;
  readonly emergencyP?: number;
}): Record<string, number> {
  if (input.emergencyP === undefined) {
    return splitProbabilities(labelNames, input.label, input.labelP);
  }
  const pins: Record<string, number> = { emergency: input.emergencyP };
  if (input.label !== "emergency") {
    pins[input.label] = Math.min(input.labelP, 1 - input.emergencyP);
  }
  const free = labelNames.filter((name) => pins[name] === undefined);
  let pinnedSum = 0;
  for (const name of labelNames) {
    const pinned = pins[name];
    if (pinned !== undefined) {
      pinnedSum += pinned;
    }
  }
  const rest = free.length === 0 ? 0 : (1 - pinnedSum) / free.length;
  const probabilities: Record<string, number> = {};
  for (const name of labelNames) {
    probabilities[name] = pins[name] ?? rest;
  }
  return probabilities;
}

function jevPayload(input: {
  readonly label: string;
  readonly labelP: number;
  readonly channel: string;
  readonly emergencyP?: number;
  readonly overdoseOrSelfHarm?: "yes" | "no";
}): unknown {
  const labelDistribution = labelProbabilities(input);
  const answers: Record<string, unknown> = {
    label: choiceAnswer(input.label, labelDistribution),
    channel: choiceAnswer(input.channel, splitProbabilities(channelNames, input.channel, 0.9)),
  };
  if (input.overdoseOrSelfHarm !== undefined) {
    answers["overdoseOrSelfHarm"] = choiceAnswer(
      input.overdoseOrSelfHarm,
      splitProbabilities(["yes", "no"], input.overdoseOrSelfHarm, 0.9),
    );
  }
  return {
    model: "jev-1.14.0",
    answers,
  };
}

function jevCallOrderRows(): readonly {
  readonly id: (typeof jevCallOrderIds)[number];
  readonly expectedNumbers: readonly TriageNumber[];
  readonly loads: readonly PayloadLoad[];
}[] {
  return [
    {
      id: "SAFE-05",
      expectedNumbers: ["3114", "15"],
      loads: [
        emergencyLoad("psychological", "yes"),
        emergencyLoad("psychological", "no"),
        emergencyLoad("psychological"),
      ],
    },
    {
      id: "SAFE-06",
      expectedNumbers: ["3114", "15"],
      loads: [emergencyLoad("both", "yes")],
    },
    {
      id: "SAFE-07",
      expectedNumbers: ["15", "3114"],
      loads: [emergencyLoad("both", "no")],
    },
    {
      id: "SAFE-08",
      expectedNumbers: ["15"],
      loads: [emergencyLoad("physical", "yes")],
    },
  ];
}

function emergencyLoad(channel: string, harm?: "yes" | "no"): PayloadLoad {
  if (harm === undefined) {
    return jsonPayload(jevPayload({ label: "emergency", labelP: 0.9, channel }));
  }
  return jsonPayload(
    jevPayload({
      label: "emergency",
      labelP: 0.9,
      channel,
      overdoseOrSelfHarm: harm,
    }),
  );
}

function hangUntilAbort(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    void _resolve;
    if (signal === undefined || signal === null) {
      reject(new Error("missing signal"));
      return;
    }
    const fail = () => {
      reject(signal.reason);
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });
}

function checkedExamples(): ReadonlyMap<string, CheckedExample> {
  stubPayloads.length = 0;
  const httpErrorPayload = { answers: {} };
  stubPayloads.push(httpErrorPayload);
  const diagnosis = splitProbabilities(["diagnosis", ...labelNames], "diagnosis", 0.7);
  const examples = new Map<string, CheckedExample>([
    [
      "SAFE-01",
      classifyExample(
        { kind: "need-info", reason: "malformed" },
        jsonPayload({
          answers: {
            label: choiceAnswer("diagnosis", diagnosis),
            channel: choiceAnswer("physical", splitProbabilities(channelNames, "physical", 0.9)),
          },
        }),
      ),
    ],
    [
      "SAFE-02",
      classifyExample(
        { kind: "top-label-rejected", calls: ["15"] },
        jsonPayload(
          jevPayload({ label: "consult", labelP: 0.1, channel: "physical", emergencyP: 0.8 }),
        ),
      ),
    ],
    [
      "SAFE-03",
      classifyExample(
        { kind: "need-info", reason: "no-channel" },
        jsonPayload(
          jevPayload({ label: "consult", labelP: 0.1, channel: "none", emergencyP: 0.91 }),
        ),
      ),
    ],
    [
      "SAFE-04",
      classifyExample(
        { kind: "need-info", reason: "below-threshold" },
        jsonPayload(jevPayload({ label: "emergency", labelP: 0.79, channel: "physical" })),
      ),
    ],
    [
      "SAFE-09",
      classifyExample(
        { kind: "need-info", reason: "malformed" },
        jsonPayload(jevPayload({ label: "emergency", labelP: 0.9, channel: "both" })),
      ),
    ],
    [
      "SAFE-10",
      {
        through: ["classify"],
        defaultTimeoutMs: 1500,
        probes: [
          {
            reject: { kind: "need-info", reason: "timeout" },
            timeoutMs: 30,
            fetch: (input, init) => {
              void input;
              return hangUntilAbort(init?.signal);
            },
          },
          {
            reject: { kind: "need-info", reason: "http" },
            fetch: async () => Response.json(httpErrorPayload, { status: 500 }),
          },
          {
            reject: { kind: "need-info", reason: "network" },
            fetch: async () => {
              throw new TypeError("network down");
            },
          },
          {
            reject: { kind: "need-info", reason: "malformed" },
            fetch: async () => new Response("{", { status: 200 }),
          },
        ],
      },
    ],
    [
      "SAFE-11",
      classifyExample(
        { kind: "offer-3114-only" },
        jsonPayload(jevPayload({ label: "consult", labelP: 0.66, channel: "psychological" })),
      ),
    ],
    [
      "SAFE-12",
      gateExample([
        {
          expected: "emergency",
          predicted: "emergency",
          expectedNumbers: ["3114", "15"],
          predictedNumbers: ["15", "3114"],
          latencyMs: 1,
          fallback: false,
        },
        {
          expected: "emergency",
          predicted: "consult",
          expectedNumbers: ["15"],
          predictedNumbers: ["15"],
          latencyMs: 1,
          fallback: false,
        },
      ]),
    ],
    ["SAFE-13", replyExample(`Reste calme. ${call15Now}`, ["15"], "numbers")],
    [
      "SAFE-14",
      replyExample(`Reste calme. ${call3114Now} ${call15Now}`, ["3114", "15"], "numbers"),
    ],
    [
      "SAFE-15",
      replyExample(`Reste calme. ${call3114Now} ${call15Now}`, ["3114", "15"], "numbers"),
    ],
    [
      "SAFE-16",
      replyExample(`Reste calme. ${call15Now} ${call3114}`, ["15", "3114"], "numbers"),
    ],
    [
      "SAFE-17",
      replyExample(`Reste calme. ${call3114Now} ${call15Now}`, ["3114", "15"], "numbers"),
    ],
    ["SAFE-18", replyExample(call15Now, [], "numbers", { conditional15Allowed: true })],
    [
      "SAFE-19",
      replyExample("Tu peux appeler le 3114.", [], "numbers", { optional3114Allowed: true }),
    ],
    [
      "SAFE-20",
      replyExample(`${call15Now} ${refusal112} Repose-toi.`, ["15"], "contains 112"),
    ],
    ["SAFE-21", { through: ["evalExitCode"], status: { scored: true, failed: 1, errors: 0 } }],
    ["SAFE-23", replyExample("Tu peux attendre demain.", ["15"], "numbers")],
    ["SAFE-24", replyExample("Tu peux attendre demain.", ["15"], "numbers")],
    ["SAFE-25", replyExample("Tu peux attendre demain.", ["3114", "15"], "numbers")],
    ["SAFE-26", replyExample("Tu as raison, ce n'est rien.", ["15"], "numbers")],
    ["SAFE-28", replyExample(call15Now, [], "numbers", { conditional15Allowed: true })],
    [
      "SAFE-29",
      {
        through: ["ensureEmergencyCalls"],
        reply: "Reste avec moi.",
        calls: ["3114", "15"],
      },
    ],
    [
      "SAFE-32",
      {
        through: ["triageTurn"],
        earlierTurns: [
          "J'ai des idées noires.",
          "Un.",
          "Deux.",
          "Trois.",
          "Quatre.",
          "Cinq.",
          "Six.",
          "Sept.",
        ],
        mustReach: "J'ai des idées noires.",
      },
    ],
  ]);
  for (const row of jevCallOrderRows()) {
    examples.set(row.id, orderExample(row.expectedNumbers, row.loads));
  }
  return examples;
}
