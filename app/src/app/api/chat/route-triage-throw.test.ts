import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@steve/triage", async () => {
  const actual = await vi.importActual<typeof import("@steve/triage")>("@steve/triage");
  return {
    ...actual,
    classify: () => Promise.reject(new Error("classifier failed")),
  };
});

import { emergencySafetySentence } from "./emergency-templates.js";
import { POST } from "./route.js";
import { systemPrompt } from "./system-prompt.js";
import { readTriageLog, resetTriageLog } from "./triage-log.js";

const canary = "test-openrouter-key-canary";
const jevCanary = "test-jev-key-canary";
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";

beforeEach(() => {
  vi.stubEnv("JEV_API_KEY", "");
  resetTriageLog();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetTriageLog();
});

it("logs a thrown classifier and still sends only the system prompt", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("JEV_API_KEY", jevCanary);
  delete process.env["OPENROUTER_MODEL"];
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      model: "openai/gpt-6.1-terra",
      choices: [{ message: { content: "D'accord." } }],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "De garde" }] }),
    }),
  );
  const text = await response.text();
  expect(text).not.toContain("classifier failed");
  expect(text).not.toContain(canary);
  expect(text).not.toContain(jevCanary);
  expect(JSON.parse(text)).toEqual({
    reply: `D'accord. ${emergencySafetySentence}`,
    mocked: false,
    model: "openai/gpt-6.1-terra",
  });
  const call = fetchMock.mock.calls.find((item) => String(item[0]) === openRouterUrl);
  const sent: unknown = JSON.parse(String(call?.[1]?.body));
  expect(sent).toMatchObject({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "De garde" },
    ],
  });
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "throw" }]);
});
