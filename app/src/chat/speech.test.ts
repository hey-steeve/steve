import { expect, it } from "vitest";
import { readSpeechSynthesis } from "./speech.js";

it("returns no speech engine when speechSynthesis is missing", () => {
  expect(readSpeechSynthesis({})).toBeNull();
  const blank: { speechSynthesis?: object | null } = {};
  Reflect.set(blank, "speechSynthesis", undefined);
  expect(readSpeechSynthesis(blank)).toBeNull();
  expect(readSpeechSynthesis({ speechSynthesis: null })).toBeNull();
  expect(readSpeechSynthesis({ speechSynthesis: { cancel() {} } })).toBeNull();
});

it("returns the speech engine when the host has one", () => {
  const engine = {
    cancel() {},
    getVoices() {
      return [];
    },
    speak() {},
    addEventListener() {},
    removeEventListener() {},
  };
  expect(readSpeechSynthesis({ speechSynthesis: engine })).toBe(engine);
});
