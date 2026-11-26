import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const namedServerOnly = new Set(["session-secret.ts", "mint-cap.ts"]);
const sources = readdirSync(dir).filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
);
const isServerOnly = (file: string) =>
  namedServerOnly.has(file) ||
  /^\/\/\s*server only/i.test(
    readFileSync(join(dir, file), "utf8").split("\n")[0] ?? "",
  );
const serverOnly = new Set(sources.filter(isServerOnly));
const clientFiles = sources.filter((f) => !serverOnly.has(f));
const literal = (n: ts.Node | undefined) =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    ? n.text
    : undefined;
const specifiersOf = (text: string) => {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier
    ) {
      out.push(literal(n.moduleSpecifier) ?? "");
    } else if (
      ts.isExternalModuleReference(n) ||
      (ts.isCallExpression(n) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(n.expression) && n.expression.text === "require")))
    ) {
      out.push(
        literal(ts.isCallExpression(n) ? n.arguments[0] : n.expression) ?? "",
      );
    }
    ts.forEachChild(n, visit);
  };
  visit(ts.createSourceFile("x.ts", text, ts.ScriptTarget.Latest, true));
  return out.filter(Boolean);
};
const specifiers = (file: string) =>
  specifiersOf(readFileSync(join(dir, file), "utf8"));
const target = (spec: string) =>
  spec.startsWith(".") ? resolve(dir, spec).replace(/\.(js|ts)x?$/, "") : "";
const serverTargets = new Set(
  [...serverOnly].map((f) => join(dir, f).replace(/\.tsx?$/, "")),
);
const offendersIn = (text: string) =>
  specifiersOf(text).filter((s) => serverTargets.has(target(s)));

describe("voice client modules", () => {
  it("finds client and server-only modules", () => {
    expect(clientFiles).toContain("realtime-socket.ts");
    expect(clientFiles).toContain("mock-session.ts");
    expect([...serverOnly]).toEqual(
      expect.arrayContaining([...namedServerOnly]),
    );
  });

  it("import no server-only module", () => {
    const offenders = clientFiles.flatMap((f) =>
      specifiers(f)
        .filter((s) => serverTargets.has(target(s)))
        .map((s) => `${f} imports ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it("reports every import form of a server-only module", () => {
    for (const src of [
      'import { x } from "./session-secret";',
      'import "./session-secret.ts";',
      'export { x } from "./session-secret.js";',
      'const m = require("./mint-cap");',
      'const m = await import("./session-secret");',
      "const m = await import(`./session-secret`);",
      "const m = await import(`./session-secret.ts`);",
      'import x = require("./session-secret");',
    ]) {
      expect(offendersIn(src), src).toHaveLength(1);
    }
    expect(offendersIn('import { y } from "./mock-session";')).toEqual([]);
    expect(offendersIn("await import(`./${name}`);")).toEqual([]);
  });
});
