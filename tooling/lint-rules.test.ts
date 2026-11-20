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

const appInbound = "Features and shared must not import app.";

const appOutbound =
  "app may import @steve/shared and features only through their package public index (@steve/<feature>), never a deep path.";

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
      'import "@steve/conversation";\n',
      "features/voice/src/cross.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("reports an import() type query of another feature", async () => {
    const found = await messages(
      'export type T = import("@steve/conversation").X;\n',
      "features/voice/src/type-query.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("reports a relative import that leaves the feature", async () => {
    const found = await messages(
      'import "../../conversation/src/index.ts";\n',
      "features/voice/src/relative.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("reports require() of another feature", async () => {
    const byPackage = await messages(
      'require("@steve/conversation");\n',
      "features/voice/src/require-package.ts",
    );
    const byPath = await messages(
      'require("../../conversation/src/index.ts");\n',
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

  it("allows app to import @steve/shared and a feature public index", async () => {
    const shared = await messages(
      'import "@steve/shared";\n',
      "app/src/shared.ts",
    );
    const feature = await messages(
      'import "@steve/voice";\n',
      "app/src/feature.ts",
    );
    expect(shared).toEqual([]);
    expect(feature).toEqual([]);
  });

  it("reports a deep feature import from app", async () => {
    const byPackage = await messages(
      'import "@steve/voice/src/index.ts";\n',
      "app/src/deep-package.ts",
    );
    const byPath = await messages(
      'import "../../features/voice/src/index.ts";\n',
      "app/src/deep-path.ts",
    );
    expect(byPackage).toEqual([appOutbound]);
    expect(byPath).toEqual([appOutbound]);
  });

  it("reports a feature or shared importing app", async () => {
    const feature = await messages(
      'import "@steve/app";\n',
      "features/voice/src/app.ts",
    );
    const shared = await messages('import "@steve/app";\n', "shared/src/app.ts");
    const relative = await messages(
      'import "../../../app/src/page.tsx";\n',
      "features/voice/src/to-app.ts",
    );
    const required = await messages(
      'require("@steve/app");\n',
      "features/booking/src/require-app.ts",
    );
    expect(feature).toEqual([appInbound]);
    expect(shared).toEqual([appInbound]);
    expect(relative).toEqual([appInbound]);
    expect(required).toEqual([appInbound]);
  });

  it("reports console.log in app", async () => {
    const found = await messages("console.log('x');\n", "app/src/log.tsx");
    expect(found).toEqual([noConsole]);
  });
});
