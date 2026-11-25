import { VOICE_MODEL, buildSessionConfig } from "./index.ts";
import { expect, it } from "vitest";

const base = {
  instructions: "Tu es Steve.",
  keyterms: ["Alan", "mutuelle"],
  tuning: { reasoningEffort: "none", codec: "pcm16-24k", transport: "json" },
} as const;

it("pins model, voice, language and server VAD", () => {
  const config = buildSessionConfig(base);
  expect(VOICE_MODEL).toBe("grok-voice-3.0");
  expect(config.model).toBe("grok-voice-3.0");
  expect(config.voice).toBe("eve");
  expect(config.language_hint).toBe("fr");
  expect(config.turn_detection.type).toBe("server_vad");
});

it("injects instructions and keyterms from the caller", () => {
  const config = buildSessionConfig(base);
  expect(config.instructions).toBe("Tu es Steve.");
  expect(config.keyterms).toEqual(["Alan", "mutuelle"]);
});

it("forwards tuning", () => {
  const config = buildSessionConfig({
    ...base,
    tuning: { reasoningEffort: "high", codec: "opus", transport: "binary" },
  });
  expect(config.reasoning.effort).toBe("high");
  expect(config.transport).toBe("binary");
  expect(config.audio.input.format).toEqual({ type: "audio/opus" });
  expect(buildSessionConfig(base).audio.output.format).toEqual({
    type: "audio/pcm",
    rate: 24000,
  });
});
