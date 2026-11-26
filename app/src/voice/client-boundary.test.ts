import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
const specifiers = (file: string) =>
  [
    ...readFileSync(join(dir, file), "utf8").matchAll(
      /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g,
    ),
  ].map((m) => m[1] ?? "");
const target = (spec: string) =>
  spec.startsWith(".") ? resolve(dir, spec).replace(/\.(js|ts)x?$/, "") : "";

describe("voice client modules", () => {
  it("finds client and server-only modules", () => {
    expect(clientFiles).toContain("realtime-socket.ts");
    expect(clientFiles).toContain("mock-session.ts");
    expect([...serverOnly]).toEqual(
      expect.arrayContaining([...namedServerOnly]),
    );
  });

  it("import no server-only module", () => {
    const serverTargets = new Set(
      [...serverOnly].map((f) => join(dir, f).replace(/\.tsx?$/, "")),
    );
    const offenders = clientFiles.flatMap((f) =>
      specifiers(f)
        .filter((s) => serverTargets.has(target(s)))
        .map((s) => `${f} imports ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
