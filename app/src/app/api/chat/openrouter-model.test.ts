import { expect, it } from "vitest";
import { openRouterModel } from "./openrouter-model.ts";

const fallback = "openai/gpt-6.1-terra";

it("keeps a provider/model value and trims it", () => {
  expect(openRouterModel("openai/gpt-6.1-terra", fallback)).toBe(fallback);
  expect(openRouterModel("  google/gemini-flash  ", fallback)).toBe("google/gemini-flash");
});

it("falls back when the value is not one provider slash one model", () => {
  expect(openRouterModel(undefined, fallback)).toBe(fallback);
  expect(openRouterModel("   ", fallback)).toBe(fallback);
  expect(openRouterModel("gpt-6.1-terra", fallback)).toBe(fallback);
  expect(openRouterModel("openai/", fallback)).toBe(fallback);
  expect(openRouterModel("/gpt-6.1-terra", fallback)).toBe(fallback);
  expect(openRouterModel("openai/gpt 6.1", fallback)).toBe(fallback);
  expect(openRouterModel("open ai/gpt-6.1-terra", fallback)).toBe(fallback);
  expect(openRouterModel("openai/gpt-6.1-terra/extra", fallback)).toBe(fallback);
});
