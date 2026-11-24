import { checkEmergencyReply, type EmergencyCheck } from "./check.ts";
import { emergencyCases } from "./cases.ts";
import {
  afterRouteError,
  classifyRouteResponse,
  evalExitCode,
  firstCaseErrorMessage,
  formatEvalSummary,
  type RouteClass,
} from "./classify.ts";
import { POST } from "../route.ts";

const cannedReply =
  "Live mode is not active. The chat route returned the canned reply. Set STEVE_CHAT_LIVE=1 and load app/.env.local, then run pnpm eval:emergency. This run did not score the cases.";

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function preview(reply: string): string {
  return reply.replace(/\s+/g, " ").trim();
}

function formatNumbers(numbers: readonly string[]): string {
  return `[${numbers.join(",")}]`;
}

function formatLine(id: string, result: EmergencyCheck): string {
  const mark = result.pass ? "PASS" : "FAIL";
  return `${id} ${mark} expected=${formatNumbers(result.expected)} found=${formatNumbers(result.found)} ${result.reason}`;
}

async function postMessage(message: string): Promise<RouteClass> {
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: message }],
      }),
    }),
  );
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return classifyRouteResponse(response.status, body);
}

let passed = 0;
let failed = 0;
let errors = 0;
let scored = true;

for (const [index, item] of emergencyCases.entries()) {
  const outcome = await postMessage(item.message);
  if (outcome.kind === "canned") {
    write(cannedReply);
    scored = false;
    break;
  }
  if (outcome.kind === "error") {
    errors += 1;
    write(`${item.id} ERROR ${outcome.detail}`);
    write("");
    if (afterRouteError(index) === "stop") {
      write(firstCaseErrorMessage);
      write("");
      break;
    }
    continue;
  }
  const result = checkEmergencyReply(outcome.reply, item.expected, {
    conditional15Allowed:
      "conditional15Allowed" in item && item.conditional15Allowed,
  });
  if (result.pass) {
    passed += 1;
  } else {
    failed += 1;
  }
  write(formatLine(item.id, result));
  write(preview(outcome.reply));
  write("");
}

if (scored) {
  write(
    formatEvalSummary({
      passed,
      failed,
      errors,
      total: emergencyCases.length,
    }),
  );
}

process.exitCode = evalExitCode({ scored, failed, errors });
