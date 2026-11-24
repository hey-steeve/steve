import { checkEmergencyReply, type EmergencyCheck } from "./check.ts";
import { emergencyCases } from "./cases.ts";
import { POST } from "../route.ts";

const replyPreviewLimit = 400;
const cannedReply =
  "Live mode is not active. The chat route returned the canned reply. Set STEVE_CHAT_LIVE=1 and load app/.env.local, then run pnpm eval:emergency. This run did not score the cases.";

type ChatOutcome =
  | { readonly kind: "canned" }
  | { readonly kind: "reply"; readonly reply: string }
  | { readonly kind: "fail"; readonly detail: string };

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preview(reply: string): string {
  const flat = reply.replace(/\s+/g, " ").trim();
  if (flat.length <= replyPreviewLimit) {
    return flat;
  }
  return `${flat.slice(0, replyPreviewLimit)}…`;
}

function formatNumbers(numbers: readonly string[]): string {
  return `[${numbers.join(",")}]`;
}

function formatLine(id: string, result: EmergencyCheck): string {
  const mark = result.pass ? "PASS" : "FAIL";
  return `${id} ${mark} expected=${formatNumbers(result.expected)} found=${formatNumbers(result.found)} ${result.reason}`;
}

function classify(status: number, body: unknown): ChatOutcome {
  if (!isRecord(body)) {
    return { kind: "fail", detail: `http ${status}` };
  }
  if (body["mocked"] === true) {
    return { kind: "canned" };
  }
  const reply = body["reply"];
  if (typeof reply === "string" && reply.startsWith("[Réponse simulée]")) {
    return { kind: "canned" };
  }
  if (status === 200 && typeof reply === "string" && reply.length > 0) {
    return { kind: "reply", reply };
  }
  const error = body["error"];
  if (typeof error === "string" && error.length > 0) {
    return { kind: "fail", detail: error };
  }
  return { kind: "fail", detail: `http ${status}` };
}

async function postMessage(message: string): Promise<ChatOutcome> {
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
    return { kind: "fail", detail: `http ${response.status}` };
  }
  return classify(response.status, body);
}

let passed = 0;
let scored = true;

for (const item of emergencyCases) {
  const outcome = await postMessage(item.message);
  if (outcome.kind === "canned") {
    write(cannedReply);
    scored = false;
    break;
  }
  if (outcome.kind === "fail") {
    write(
      `${item.id} FAIL expected=${formatNumbers(item.expected)} found=[] ${outcome.detail}`,
    );
    write("");
    continue;
  }
  const result = checkEmergencyReply(outcome.reply, item.expected);
  if (result.pass) {
    passed += 1;
  }
  write(formatLine(item.id, result));
  write(preview(outcome.reply));
  write("");
}

if (!scored) {
  process.exitCode = 1;
} else {
  write(`${passed}/${emergencyCases.length}`);
  if (passed !== emergencyCases.length) {
    process.exitCode = 1;
  }
}
