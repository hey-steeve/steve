import { expect, it } from "vitest";
import { crossBoundaryFailure, parseLabelList } from "./cross-boundary.ts";

const appFile = "app/src/page.tsx";
const sharedFile = "shared/src/design-tokens.ts";

const bothTreesMessage = [
  "This pull request changes both app/ and shared/.",
  "",
  "app/:",
  `- ${appFile}`,
  "",
  "shared/:",
  `- ${sharedFile}`,
  "",
  "Split the pull request so app/ and shared/ change in separate pull requests. If the mix is intentional, add the cross-boundary label.",
].join("\n");

it("passes when only app/ changes", () => {
  expect(
    crossBoundaryFailure({
      files: [appFile, "app/package.json"],
      labels: [],
    }),
  ).toBeUndefined();
});

it("passes when only shared/ changes", () => {
  expect(
    crossBoundaryFailure({
      files: [sharedFile],
      labels: [],
    }),
  ).toBeUndefined();
});

it("fails when app/ and shared/ both change", () => {
  expect(
    crossBoundaryFailure({
      files: [appFile, "features/voice/src/index.ts", sharedFile],
      labels: [],
    }),
  ).toBe(bothTreesMessage);
});

it("passes when both trees change and the cross-boundary label is set", () => {
  expect(
    crossBoundaryFailure({
      files: [appFile, sharedFile],
      labels: ["bug", "cross-boundary"],
    }),
  ).toBeUndefined();
});

it("passes when other paths change", () => {
  expect(
    crossBoundaryFailure({
      files: [
        "features/voice/src/index.ts",
        "AGENTS.md",
        ".github/workflows/ci.yml",
      ],
      labels: [],
    }),
  ).toBeUndefined();
});

it("does not treat app-foo/ or shared-x/ as app/ or shared/", () => {
  expect(
    crossBoundaryFailure({
      files: ["app-foo/src/index.ts", "shared-x/src/index.ts"],
      labels: [],
    }),
  ).toBeUndefined();
});

it("names the first five files in each tree", () => {
  const appFiles = [
    "app/a.ts",
    "app/b.ts",
    "app/c.ts",
    "app/d.ts",
    "app/e.ts",
    "app/f.ts",
  ];
  const sharedFiles = [
    "shared/a.ts",
    "shared/b.ts",
    "shared/c.ts",
    "shared/d.ts",
    "shared/e.ts",
    "shared/f.ts",
  ];
  const message = crossBoundaryFailure({
    files: [...appFiles, ...sharedFiles],
    labels: [],
  });
  expect(message).toContain("- app/a.ts");
  expect(message).toContain("- app/e.ts");
  expect(message).not.toContain("app/f.ts");
  expect(message).toContain("- shared/a.ts");
  expect(message).not.toContain("shared/f.ts");
  expect(message).toContain("- and 1 more");
  expect(message).toContain("cross-boundary");
});

it("reads labels from a JSON array or from lines", () => {
  expect(parseLabelList("")).toEqual([]);
  expect(parseLabelList("null")).toEqual([]);
  expect(parseLabelList('[\n  "cross-boundary",\n  "bug"\n]')).toEqual([
    "cross-boundary",
    "bug",
  ]);
  expect(parseLabelList("bug\ncross-boundary\n")).toEqual([
    "bug",
    "cross-boundary",
  ]);
  expect(
    crossBoundaryFailure({
      files: [appFile, sharedFile],
      labels: parseLabelList('["cross-boundary"]'),
    }),
  ).toBeUndefined();
});

it("rejects a label payload that is not a string array", () => {
  expect(() => parseLabelList("[")).toThrow(Error);
  expect(() => parseLabelList("[1]")).toThrow(Error);
});
