import { expect, it } from "vitest";
import { homeGreeting } from "./home-greeting.js";

it("formats a home greeting with the patient's first name", () => {
  expect(homeGreeting("Peter")).toBe("Hello Peter,");
  expect(homeGreeting(" Peter ")).toBe("Hello Peter,");
});

it("falls back to Bonjour when the first name is missing", () => {
  expect(homeGreeting(undefined)).toBe("Hello");
  expect(homeGreeting("")).toBe("Hello");
  expect(homeGreeting("   ")).toBe("Hello");
  expect(homeGreeting("\n\t")).toBe("Hello");
});
