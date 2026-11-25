import {
  checkEmergencyReply,
  encodeSavedReply,
  formatEmergencyScoreLine,
  normalizeReply,
} from "./check.ts";
import { caseMessages, emergencyCases } from "./cases.ts";
import {
  afterRouteError,
  classifyRouteResponse,
  evalExitCode,
  firstCaseErrorMessage,
  formatEvalSummary,
  type RouteClass,
} from "./classify.ts";
import { readGit, runHeaderLines } from "./header.ts";
import { triageStatusLine, withoutSafetySentence } from "./score-reply.ts";
import { POST } from "../route.ts";

const cannedReply =
  "Live mode is not active. The chat route returned the canned reply. Set STEVE_CHAT_LIVE=1 and provide OPENROUTER_API_KEY in the environment or in app/.env.local, then run pnpm eval:emergency. This run did not score the cases.";

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function postMessage(item: (typeof emergencyCases)[number]): Promise<RouteClass> {
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: caseMessages(item),
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

for (const line of runHeaderLines({ now: new Date(), env: process.env, git: readGit })) {
  write(line);
}
write(triageStatusLine((process.env["JEV_API_KEY"] ?? "").trim().length > 0));
write("");

let passed = 0;
let failed = 0;
let errors = 0;
let scored = true;

for (const [index, item] of emergencyCases.entries()) {
  const outcome = await postMessage(item);
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
  // The saved line keeps the whole reply. The score leaves out the appended safety sentence.
  const reply = normalizeReply(outcome.reply);
  const result = checkEmergencyReply(withoutSafetySentence(reply), item.expected, {
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
  write(formatEmergencyScoreLine(item.id, result));
  write(encodeSavedReply(reply));
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
