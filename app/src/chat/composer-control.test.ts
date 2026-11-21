import { expect, it } from "vitest";
import { composerControl } from "./composer-control.js";

it("returns send for non-whitespace text and dictate otherwise", () => {
  expect(
    composerControl({ draft: " bonjour ", listening: true, supported: false }),
  ).toEqual({ kind: "send" });
  expect(composerControl({ draft: "", listening: false, supported: true })).toEqual({
    kind: "dictate",
    listening: false,
    supported: true,
  });
  expect(
    composerControl({ draft: " \n\t ", listening: true, supported: false }),
  ).toEqual({
    kind: "dictate",
    listening: true,
    supported: false,
  });
});
