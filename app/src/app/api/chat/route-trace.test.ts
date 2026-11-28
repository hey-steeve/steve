import type { TriageDecision } from "@steve/triage";
import { afterEach, expect, it, vi } from "vitest";

const decision = vi.hoisted(() => {
  const state: { current: TriageDecision | null } = { current: null };
  return state;
});

vi.mock("../jev", () => ({
  triageWithJev: async () => decision.current,
}));

import { triageTraceHeader } from "../../../chat/thinking-trace.js";
import { POST } from "./route.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  decision.current = null;
});

function post(content: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content }] }),
    }),
  );
}

function liveReply(): void {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ model: "m", choices: [{ message: { content: "D'accord." } }] }),
    ),
  );
}

it("labels a live reply with the triage outcome and leaves the body alone", async () => {
  liveReply();
  decision.current = { label: "need-info" };
  const response = await post("J'ai mal à la gorge");
  expect(response.headers.get(triageTraceHeader)).toBe("need-info");
  expect(await response.json()).toEqual({ reply: "D'accord.", mocked: false, model: "m" });
});

it("sends no triage label when triage did not run", async () => {
  liveReply();
  const response = await post("J'ai mal à la gorge");
  expect(response.headers.get(triageTraceHeader)).toBeNull();
});

it("sends no triage label in mock mode", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "");
  const response = await post("J'ai mal à la gorge");
  expect(response.headers.get(triageTraceHeader)).toBeNull();
});
