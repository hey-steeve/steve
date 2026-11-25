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

  it("reports a template-literal import() of a deep feature path", async () => {
    const found = await messages(
      "void import(`../../features/x/src/y.ts`);\n",
      "app/src/import-template.ts",
    );
    expect(found).toEqual([appOutbound]);
  });

  it("reports require() of a template literal that leaves the feature", async () => {
    const found = await messages(
      "require(`../../conversation/src/index.ts`);\n",
      "features/voice/src/require-template.ts",
    );
    expect(found).toEqual([featureBoundary]);
  });

  it("ignores a template literal import() that has an expression", async () => {
    const found = await messages(
      "void import(`../../features/${name}/src/y.ts`);\n",
      "app/src/import-dynamic.ts",
    );
    expect(found).toEqual([]);
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

  it("allows app to import @steve/shared/logger and rejects a deep feature path", async () => {
    const logger = await messages(
      'import "@steve/shared/logger";\n',
      "app/src/logger.ts",
    );
    const deep = await messages(
      'import "@steve/voice/src/call.ts";\n',
      "app/src/deep-feature.ts",
    );
    expect(logger).toEqual([]);
    expect(deep).toEqual([appOutbound]);
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

  it("reports console.log in tooling", async () => {
    const found = await messages("console.log('x');\n", "tooling/log.ts");
    expect(found).toEqual([noConsole]);
  });
});

const typeAssertion = "Do not use any type assertions.";
const explicitAny = "Unexpected any. Specify a different type.";
const nonNullAssertion = "Forbidden non-null assertion.";
const floatingPromise =
  "Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator.";

describe("typed lint rules", () => {
  it("bans a type assertion and allows as const", async () => {
    const asserted = await messages(
      "export const value = 1 as number;\n",
      "app/src/asserted.ts",
    );
    const literal = await messages(
      "export const value = { lossless: true as const };\n",
      "app/src/literal.ts",
    );
    const list = await messages(
      "export const value = [1, 2] as const;\n",
      "tooling/literal.ts",
    );
    expect(asserted).toContain(typeAssertion);
    expect(literal).toEqual([]);
    expect(list).toEqual([]);
  });

  it("bans an angle-bracket assertion", async () => {
    const found = await messages(
      "const value = 1;\nexport const asserted = <number>value;\n",
      "app/src/angle.ts",
    );
    expect(found).toContain(typeAssertion);
  });

  it("bans an explicit any", async () => {
    const found = await messages(
      "export function read(value: any): any {\n  return value;\n}\n",
      "features/voice/src/any.ts",
    );
    expect(found).toContain(explicitAny);
  });

  it("bans a non-null assertion", async () => {
    const found = await messages(
      "export function read(value: string | null): string {\n  return value!;\n}\n",
      "shared/src/non-null.ts",
    );
    expect(found).toContain(nonNullAssertion);
  });

  it("bans a floating promise and allows an intentional void", async () => {
    const floating = await messages(
      "async function load(): Promise<void> {\n  return undefined;\n}\nload();\n",
      "app/src/floating.ts",
    );
    const ignored = await messages(
      "async function load(): Promise<void> {\n  return undefined;\n}\nvoid load();\n",
      "app/src/voided.ts",
    );
    expect(floating).toContain(floatingPromise);
    expect(ignored).toEqual([]);
  });
});
