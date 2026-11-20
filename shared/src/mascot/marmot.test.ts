import { validateAvatar } from "open-bot-avatar";
import { expect, it } from "vitest";
import { marmot } from "./index.js";

it("accepts the marmot definition", () => {
  expect(validateAvatar(marmot).ok).toBe(true);
});
