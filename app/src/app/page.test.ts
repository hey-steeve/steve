import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { expect, it } from "vitest";
import Page from "./page.js";

it("sends / to the home", () => {
  expect.assertions(1);
  try {
    Page();
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }
    expect(getURLFromRedirectError(error)).toBe("/chat");
  }
});
