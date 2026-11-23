import { expect, it } from "vitest";
import { homeGreeting } from "./home-greeting.js";

it("formats a home greeting with the patient's first name", () => {
  expect(homeGreeting("Peter")).toBe("Bonjour Peter,");
  expect(homeGreeting(" Peter ")).toBe("Bonjour Peter,");
});

it("falls back to Bonjour when the first name is missing", () => {
  expect(homeGreeting(undefined)).toBe("Bonjour");
  expect(homeGreeting("")).toBe("Bonjour");
  expect(homeGreeting("   ")).toBe("Bonjour");
  expect(homeGreeting("\n\t")).toBe("Bonjour");
});
