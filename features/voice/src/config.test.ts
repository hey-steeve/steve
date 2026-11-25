import { TRANSCRIPTION_MODEL, VOICE_MODEL, buildSessionConfig } from "./index.ts";
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
  expect(config.audio.input.transcription.language_hint).toBe("fr");
  expect(config.turn_detection.type).toBe("server_vad");
});

it("injects instructions and keyterms from the caller", () => {
  const config = buildSessionConfig(base);
  expect(config.instructions).toBe("Tu es Steve.");
  expect(config.audio.input.transcription.keyterms).toEqual(["Alan", "mutuelle"]);
});

it("nests language and keyterms under audio.input.transcription with the model", () => {
  const config = buildSessionConfig(base);
  expect(TRANSCRIPTION_MODEL).toBe("grok-transcribe");
  expect(config.audio.input.transcription).toEqual({
    model: "grok-transcribe",
    language_hint: "fr",
    keyterms: ["Alan", "mutuelle"],
  });
  expect(config).not.toHaveProperty("language_hint");
  expect(config).not.toHaveProperty("keyterms");
});

it("forwards tuning", () => {
  const config = buildSessionConfig({
    ...base,
    tuning: { reasoningEffort: "high", codec: "opus", transport: "binary" },
  });
  expect(config.reasoning.effort).toBe("high");
  expect(config).not.toHaveProperty("transport");
  expect(config.audio.input.transport).toBe("binary");
  expect(config.audio.output.transport).toBe("binary");
  expect(config.audio.input.format).toEqual({ type: "audio/opus" });
  expect(buildSessionConfig(base).audio.output.format).toEqual({
    type: "audio/pcm",
    rate: 24000,
  });
});
