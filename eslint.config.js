import tseslint from "typescript-eslint";
import steve from "./tooling/eslint/plugin.js";

export default [
  {
    ignores: ["**/dist/**", "**/coverage/**", "**/.next/**"],
  },
  {
    files: [
      "shared/**/*.ts",
      "features/**/*.ts",
      "app/**/*.ts",
      "app/**/*.tsx",
      "tooling/**/*.ts",
      "tooling/**/*.js",
    ],
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
  {
    files: [
      "shared/**/*.ts",
      "features/**/*.ts",
      "app/**/*.ts",
      "app/**/*.tsx",
      "tooling/**/*.ts",
    ],
    // TS and TSX only, tests included. Tooling JS stays on the untyped rules above.
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 40,
          allowDefaultProject: [
            "app/src/asserted.ts",
            "app/src/deep-feature.ts",
            "app/src/deep-package.ts",
            "app/src/deep-path.ts",
            "app/src/feature.ts",
            "app/src/floating.ts",
            "app/src/import-dynamic.ts",
            "app/src/import-template.ts",
            "app/src/literal.ts",
            "app/src/log.tsx",
            "app/src/logger.ts",
            "app/src/shared.ts",
            "app/src/voided.ts",
            "features/booking/src/require-app.ts",
            "features/voice/src/any.ts",
            "features/voice/src/app.ts",
            "features/voice/src/cross.ts",
            "features/voice/src/log.ts",
            "features/voice/src/ok.ts",
            "features/voice/src/relative.ts",
            "features/voice/src/require-package.ts",
            "features/voice/src/require-path.ts",
            "features/voice/src/require-template.ts",
            "features/voice/src/to-app.ts",
            "features/voice/src/type-query.ts",
            "shared/src/app.ts",
            "shared/src/cross.ts",
            "shared/src/log.ts",
            "shared/src/non-null.ts",
            "tooling/literal.ts",
            "tooling/log.ts",
          ],
          defaultProject: "tsconfig.base.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
];
