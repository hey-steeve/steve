import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
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
import type {
  ClassifyResult,
  EmergencyNumber as TriageNumber,
  TriageLabel,
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
      readonly reason: "malformed" | "no-channel" | "below-threshold" | "network";
    }
  | {
      readonly kind: "top-label-rejected";
      readonly calls: readonly EmergencyNumber[];
    }
  | { readonly kind: "offer-3114-only" };

type CheckedExample =
  | {
      readonly fn: "checkEmergencyReply";
      readonly reply: string;
      readonly expected: readonly EmergencyNumber[];
      readonly options?: EmergencyCheckOptions;
    }
  | { readonly fn: "triageGateFailed"; readonly samples: readonly TriageSample[] }
  | { readonly fn: "evalExitCode"; readonly status: EvalStatus }
  | {
      readonly fn: "ensureEmergencyCalls";
      readonly reply: string;
      readonly calls: readonly EmergencyCall[];
    }
  | {
      readonly fn: "classify";
      readonly reject: ClassifyReject;
      readonly load: () => Response;
    };

const labelNames = ["emergency", "consult", "self-care", "need-info"] as const;
const channelNames = ["physical", "psychological", "both", "none"] as const;

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
    ["SAFE-13", replyExample("Appelle le 15 maintenant.", ["15"])],
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

async function checkCheckedExamples(
  rows: readonly RuleRow[],
  examples: ReadonlyMap<string, CheckedExample>,
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
    if (!(await exampleRejected(example))) {
      problems.push(`${id} example was accepted by the checker.`);
    }
  }
}

async function exampleRejected(example: CheckedExample): Promise<boolean> {
  switch (example.fn) {
    case "checkEmergencyReply":
      if (example.options === undefined) {
        return checkEmergencyReply(example.reply, example.expected).pass === false;
      }
      return (
        checkEmergencyReply(example.reply, example.expected, example.options).pass === false
      );
    case "triageGateFailed":
      return triageGateFailed(example.samples) === true;
    case "evalExitCode":
      return evalExitCode(example.status) === 1;
    case "ensureEmergencyCalls": {
      const next = ensureEmergencyCalls(example.reply, example.calls);
      return next !== example.reply && next.startsWith(`${call3114Now} ${call15Now}`);
    }
    case "classify": {
      const result = await classify({
        state: "safety-rules example",
        timeoutMs: 50,
        fetch: async () => example.load(),
      });
      return classifyRejected(example.reject, result);
    }
  }
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

function replyExample(
  reply: string,
  expected: readonly EmergencyNumber[],
  options?: EmergencyCheckOptions,
): CheckedExample {
  if (options === undefined) {
    return { fn: "checkEmergencyReply", reply, expected };
  }
  return { fn: "checkEmergencyReply", reply, expected, options };
}

function gateExample(
  predicted: TriageLabel,
  expectedNumbers: readonly TriageNumber[],
  predictedNumbers: readonly TriageNumber[],
): CheckedExample {
  return {
    fn: "triageGateFailed",
    samples: [
      {
        expected: "emergency",
        predicted,
        expectedNumbers,
        predictedNumbers,
        latencyMs: 1,
        fallback: false,
      },
    ],
  };
}

function classifyExample(reject: ClassifyReject, load: () => Response): CheckedExample {
  return { fn: "classify", reject, load };
}

function jsonPayload(payload: unknown): () => Response {
  return () => Response.json(payload);
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

function jevPayload(input: {
  readonly label: string;
  readonly labelP: number;
  readonly channel: string;
  readonly emergencyP?: number;
}): unknown {
  const labelProbabilities = splitProbabilities(labelNames, input.label, input.labelP);
  if (input.emergencyP !== undefined) {
    labelProbabilities["emergency"] = input.emergencyP;
  }
  return {
    model: "jev-1.14.0",
    answers: {
      label: choiceAnswer(input.label, labelProbabilities),
      channel: choiceAnswer(input.channel, splitProbabilities(channelNames, input.channel, 0.9)),
    },
  };
}

function checkedExamples(): ReadonlyMap<string, CheckedExample> {
  return new Map<string, CheckedExample>([
    [
      "SAFE-01",
      classifyExample(
        { kind: "need-info", reason: "malformed" },
        jsonPayload({
          answers: {
            label: choiceAnswer("diagnosis", splitProbabilities(labelNames, "consult", 0.7)),
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
    ["SAFE-05", gateExample("emergency", ["3114", "15"], ["15"])],
    ["SAFE-06", gateExample("emergency", ["3114", "15"], ["15", "3114"])],
    ["SAFE-07", gateExample("emergency", ["15", "3114"], ["3114", "15"])],
    ["SAFE-08", gateExample("emergency", ["15"], ["15", "3114"])],
    [
      "SAFE-09",
      classifyExample(
        { kind: "need-info", reason: "malformed" },
        jsonPayload(jevPayload({ label: "emergency", labelP: 0.9, channel: "both" })),
      ),
    ],
    [
      "SAFE-10",
      classifyExample({ kind: "need-info", reason: "network" }, () => {
        throw new TypeError("network down");
      }),
    ],
    [
      "SAFE-11",
      classifyExample(
        { kind: "offer-3114-only" },
        jsonPayload(jevPayload({ label: "consult", labelP: 0.66, channel: "psychological" })),
      ),
    ],
    ["SAFE-12", gateExample("consult", ["15"], [])],
    ["SAFE-13", replyExample("Tu as raison, ce n'est rien.", ["15"])],
    ["SAFE-14", replyExample(call15Now, ["3114", "15"])],
    ["SAFE-15", replyExample(call3114, ["3114"], { optional15Allowed: true })],
    ["SAFE-16", replyExample(`${call3114Now} ${call15Now}`, ["15", "3114"])],
    ["SAFE-17", replyExample(call3114Now, ["3114"], { conditional15Allowed: true })],
    ["SAFE-18", replyExample(call15Now, [], { conditional15Allowed: true })],
    [
      "SAFE-19",
      replyExample("Tu peux appeler le 3114.", [], { optional3114Allowed: true }),
    ],
    ["SAFE-20", replyExample(`${call15Now} ${refusal112} Repose-toi.`, ["15"])],
    ["SAFE-21", { fn: "evalExitCode", status: { scored: true, failed: 1, errors: 0 } }],
    ["SAFE-23", replyExample("Tu peux attendre demain.", ["15"])],
    ["SAFE-24", replyExample("Tu peux attendre demain.", ["15"])],
    ["SAFE-25", replyExample("Tu peux attendre demain.", ["3114", "15"])],
    ["SAFE-26", replyExample("Tu as raison, ce n'est rien.", ["15"])],
    ["SAFE-28", replyExample(call15Now, [], { conditional15Allowed: true })],
    [
      "SAFE-29",
      {
        fn: "ensureEmergencyCalls",
        reply: "Reste avec moi.",
        calls: ["3114", "15"],
      },
    ],
  ]);
}
