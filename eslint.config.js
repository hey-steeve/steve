import tseslint from "typescript-eslint";
import steve from "./tooling/eslint/plugin.js";

export default [
  {
    ignores: ["**/dist/**", "**/coverage/**"],
  },
  {
    files: ["shared/**/*.ts", "features/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: "module",
      ecmaVersion: "latest",
    },
    plugins: {
      steve,
    },
    rules: {
      "steve/feature-boundary": "error",
      "steve/no-console": "error",
    },
  },
];
