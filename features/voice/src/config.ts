export const VOICE_MODEL = "grok-voice-3.0" as const;
export const VOICE_NAME = "eve" as const;
export const VOICE_LANGUAGE_HINT = "fr" as const;

export type VoiceTuning = {
  readonly reasoningEffort: "none" | "high";
  readonly codec: "pcm16-24k" | "opus";
  readonly transport: "json" | "binary";
};

export type AudioFormat =
  | { readonly type: "audio/pcm"; readonly rate: 24000 }
  | { readonly type: "audio/opus" };

export type SessionConfig = {
  readonly model: typeof VOICE_MODEL;
  readonly voice: typeof VOICE_NAME;
  readonly language_hint: typeof VOICE_LANGUAGE_HINT;
  readonly instructions: string;
  readonly keyterms: readonly string[];
  readonly reasoning: { readonly effort: VoiceTuning["reasoningEffort"] };
  readonly transport: VoiceTuning["transport"];
  readonly turn_detection: { readonly type: "server_vad" };
  readonly audio: {
    readonly input: { readonly format: AudioFormat };
    readonly output: { readonly format: AudioFormat };
  };
};

const formatFor = (codec: VoiceTuning["codec"]): AudioFormat =>
  codec === "opus"
    ? { type: "audio/opus" }
    : { type: "audio/pcm", rate: 24000 };

export function buildSessionConfig(input: {
  readonly instructions: string;
  readonly keyterms: readonly string[];
  readonly tuning: VoiceTuning;
}): SessionConfig {
  const format = formatFor(input.tuning.codec);
  return {
    model: VOICE_MODEL,
    voice: VOICE_NAME,
    language_hint: VOICE_LANGUAGE_HINT,
    instructions: input.instructions,
    keyterms: [...input.keyterms],
    reasoning: { effort: input.tuning.reasoningEffort },
    transport: input.tuning.transport,
    turn_detection: { type: "server_vad" },
    audio: { input: { format }, output: { format } },
  };
}
