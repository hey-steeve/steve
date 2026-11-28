export const VOICE_MODEL = "grok-voice-3.0" as const;
export const VOICE_NAME = "eve" as const;
export const VOICE_LANGUAGE_HINT = "en" as const;
export const TRANSCRIPTION_MODEL = "grok-transcribe" as const;

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
  readonly instructions: string;
  readonly reasoning: { readonly effort: VoiceTuning["reasoningEffort"] };
  readonly turn_detection: { readonly type: "server_vad" };
  readonly audio: {
    readonly input: {
      readonly format: AudioFormat;
      readonly transport: VoiceTuning["transport"];
      readonly transcription: {
        readonly model: typeof TRANSCRIPTION_MODEL;
        readonly language_hint: typeof VOICE_LANGUAGE_HINT;
        readonly keyterms: readonly string[];
      };
    };
    readonly output: {
      readonly format: AudioFormat;
      readonly transport: VoiceTuning["transport"];
    };
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
  const transport = input.tuning.transport;
  return {
    model: VOICE_MODEL,
    voice: VOICE_NAME,
    instructions: input.instructions,
    reasoning: { effort: input.tuning.reasoningEffort },
    turn_detection: { type: "server_vad" },
    audio: {
      input: {
        format,
        transport,
        transcription: {
          model: TRANSCRIPTION_MODEL,
          language_hint: VOICE_LANGUAGE_HINT,
          keyterms: [...input.keyterms],
        },
      },
      output: { format, transport },
    },
  };
}
