import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docPath = join(root, "docs/safety-rules.md");
const chatCasesPath = join(root, "app/src/app/api/chat/eval/cases.ts");
const triageCasesPath = join(root, "features/triage/eval/cases.ts");

const tableOpen = "<!-- safety-rules:ids -->";
const tableClose = "<!-- /safety-rules:ids -->";
const tableHeader = "| ID | Rule | Verified by |";
const tableRule = "| --- | --- | --- |";

const riskLevels = new Set(["critical", "concerning", "safe"]);

type SuiteName = "chat" | "triage";

type ParsedCase = {
  readonly id: string;
  readonly risk: string | undefined;
  readonly safe: readonly string[];
};

type RuleRow = {
  readonly id: string;
  readonly rule: string;
  readonly verifiedBy: readonly string[];
};

it("maps every SAFE id in the doc to a case or test, and every case to a SAFE id", () => {
  const problems: string[] = [];
  const rows = parseRuleTable(readFileSync(docPath, "utf8"), problems);
  const chat = parseSuite(readFileSync(chatCasesPath, "utf8"), "chat", problems);
  const triage = parseSuite(readFileSync(triageCasesPath, "utf8"), "triage", problems);
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
  expect(problems, problems.join("\n")).toEqual([]);
});

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
    const match = /^\| (SAFE-\d{2}) \| ([^|]+) \| ([^|]+) \|$/.exec(line);
    if (match === null) {
      problems.push(`Unreadable ID table row: ${line}`);
      continue;
    }
    const id = match[1] ?? "";
    const rule = (match[2] ?? "").trim();
    const verifiedBy = (match[3] ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (rule.length === 0) {
      problems.push(`${id} has an empty rule.`);
    }
    if (verifiedBy.length === 0) {
      problems.push(`${id} has an empty Verified by cell.`);
    }
    rows.push({ id, rule, verifiedBy });
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

function parseSuite(source: string, suite: SuiteName, problems: string[]): ParsedCase[] {
  const cases: ParsedCase[] = [];
  const marker = "\n  {\n";
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(marker, from);
    if (at < 0) {
      break;
    }
    const bodyStart = at + marker.length;
    const end = source.indexOf("\n  }", bodyStart);
    if (end < 0) {
      problems.push(`${suite} cases.ts has an unclosed case object.`);
      break;
    }
    const body = source.slice(bodyStart, end);
    const id = /^\s*id: "([^"]+)"/m.exec(body)?.[1];
    if (id !== undefined) {
      const risk = /^\s*risk: "([^"]+)"/m.exec(body)?.[1];
      const safeRaw = /^\s*safe: \[([^\]]*)\]/m.exec(body)?.[1] ?? "";
      const safe = [...safeRaw.matchAll(/"(SAFE-\d+)"/g)]
        .map((match) => match[1] ?? "")
        .filter((item) => item.length > 0);
      cases.push({ id, risk, safe });
    }
    from = end + 4;
  }
  if (cases.length === 0) {
    problems.push(`Parsed no ${suite} cases from the case file.`);
  }
  return cases;
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
