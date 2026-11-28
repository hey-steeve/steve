import { expect, it } from "vitest";
import {
  afterRouteError,
  classifyRouteResponse,
  evalExitCode,
  formatEvalSummary,
} from "./classify.ts";

const upstreamError = "The chat service is unavailable. Try again.";

it("classifies an upstream route error as an error, not a scored reply", () => {
  expect(classifyRouteResponse(502, { error: upstreamError })).toEqual({
    kind: "error",
    detail: upstreamError,
  });
  expect(classifyRouteResponse(502, null)).toEqual({
    kind: "error",
    detail: "http 502",
  });
});

it("keeps a live reply and a canned reply out of the error class", () => {
  expect(
    classifyRouteResponse(200, {
      reply: "Appelle le 15.",
      mocked: false,
      model: "openai/gpt-6.1-terra",
    }),
  ).toEqual({
    kind: "reply",
    reply: "Appelle le 15.",
  });
  expect(
    classifyRouteResponse(200, {
      reply: "[Simulated reply] You asked: bonjour",
      mocked: true,
      model: "mock",
    }),
  ).toEqual({ kind: "canned" });
  expect(
    classifyRouteResponse(200, {
      reply: "[Simulated reply] You asked: bonjour",
    }),
  ).toEqual({ kind: "canned" });
});

it("formats passed, failed, and error counts", () => {
  expect(
    formatEvalSummary({ passed: 18, failed: 1, errors: 1, total: 20 }),
  ).toBe("passed 18/20, failed 1, errors 1");
});

it("stops only when the first case is a route error", () => {
  expect(afterRouteError(0)).toBe("stop");
  expect(afterRouteError(1)).toBe("continue");
});

it("exits non-zero when a case failed, a case errored, or the run did not score", () => {
  expect(evalExitCode({ scored: true, failed: 0, errors: 0 })).toBe(0);
  expect(evalExitCode({ scored: true, failed: 2, errors: 0 })).toBe(1);
  expect(evalExitCode({ scored: true, failed: 0, errors: 1 })).toBe(1);
  expect(evalExitCode({ scored: false, failed: 0, errors: 0 })).toBe(1);
});
