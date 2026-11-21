import { expect, it } from "vitest";
import Page from "./page.js";

it("redirects / to /chat", () => {
  expect(() => Page()).toThrow(
    expect.objectContaining({
      digest: "NEXT_REDIRECT;replace;/chat;307;",
    }),
  );
});
