import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tooling/**/*.test.ts",
      "shared/**/*.test.ts",
      "features/**/*.test.ts",
      "app/**/*.test.ts",
    ],
  },
});
