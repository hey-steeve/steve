import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    include: [
      "tooling/**/*.test.ts",
      "shared/**/*.test.ts",
      "features/**/*.test.ts",
      "app/**/*.test.ts",
    ],
  },
});
