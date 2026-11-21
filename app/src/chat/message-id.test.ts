import { afterEach, expect, it, vi } from "vitest";
import { newMessageId } from "./message-id.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("uses crypto.randomUUID when the browser provides it", () => {
  const randomUUID = vi.fn(() => "id-from-browser");
  vi.stubGlobal("crypto", { randomUUID });
  expect(newMessageId()).toBe("id-from-browser");
});

it("returns an id when randomUUID is missing or throws", () => {
  let roll = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    roll += 1;
    return roll / 10;
  });
  vi.stubGlobal("crypto", {});
  const missing = newMessageId();
  vi.stubGlobal("crypto", {
    randomUUID: () => {
      throw new Error("insecure");
    },
  });
  const thrown = newMessageId();
  expect(missing.length).toBeGreaterThan(0);
  expect(thrown.length).toBeGreaterThan(0);
  expect(thrown).not.toBe(missing);
});
