import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const featureBoundary =
  "Features must not import other features. Put the shared type or helper in shared/ (in its own PR) and import it from @steve/shared.";

const sharedBoundary =
  "shared/ must not import features. Put shared types and helpers in shared/ and let features import them from @steve/shared.";

const noConsole = "Do not use console. Use log() from @steve/shared/logger.";

async function messages(code: string, relativePath: string) {
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintText(code, {
    filePath: path.join(root, relativePath),
  });
  return results.flatMap((result) =>
    result.messages.map((message) => message.message),
  );
}

describe("package lint rules", () => {
  it("reports a feature importing another feature", async () => {
    const found = await messages(
      'import "@steve/call";\n',
      "features/voice/src/cross.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("reports an import() type query of another feature", async () => {
    const found = await messages(
      'export type T = import("@steve/call").X;\n',
      "features/voice/src/type-query.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("reports a relative import that leaves the feature", async () => {
    const found = await messages(
      'import "../../call/src/index.ts";\n',
      "features/voice/src/relative.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("reports require() of another feature", async () => {
    const byPackage = await messages(
      'require("@steve/call");\n',
      "features/voice/src/require-package.ts",
    );
    const byPath = await messages(
      'require("../../call/src/index.ts");\n',
      "features/voice/src/require-path.ts",
    );
    expect(byPackage).toEqual([featureBoundary]);
    expect(byPath).toEqual([featureBoundary]);
  });

  it("reports shared importing a feature", async () => {
    const found = await messages(
      'import "@steve/voice";\n',
      "shared/src/cross.ts",
    );
    expect(found).toEqual([sharedBoundary]);
  });

  it("allows a feature to import @steve/shared", async () => {
    const found = await messages(
      'import "@steve/shared";\n',
      "features/voice/src/ok.ts",
    );
    expect(found).toEqual([]);
  });

  it("reports console.log in a feature and in shared", async () => {
    const feature = await messages(
      "console.log('x');\n",
      "features/voice/src/log.ts",
    );
    const shared = await messages("console.log('x');\n", "shared/src/log.ts");
    expect(feature).toEqual([noConsole]);
    expect(shared).toEqual([noConsole]);
  });
});
