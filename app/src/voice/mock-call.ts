import type { VoiceTuning } from "@steve/voice";
import { startBrowserAudio } from "./browser-audio";
import {
  createLiveCall,
  type CallDeps,
  type LiveCallController,
} from "./live-call";
import { connectRealtime } from "./realtime-socket";
import { mockSecretValue } from "./mock-session";
import { voiceInstructions } from "./voice-instructions";
import { fetchVoiceTriage } from "./voice-triage";

export const defaultTuning: VoiceTuning = {
  reasoningEffort: "none",
  codec: "pcm16-24k",
  transport: "json",
};

export const defaultKeyterms: readonly string[] = ["Stevie", "SAMU", "3114"];

export const defaultInstructions = voiceInstructions;

export async function fetchVoiceToken(signal: AbortSignal): Promise<{ readonly value: string }> {
  const response = await fetch("/api/voice/session", {
    method: "POST",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error("voice session unavailable");
  const body: unknown = await response.json();
  const value = typeof body === "object" && body !== null ? Reflect.get(body, "value") : undefined;
  if (typeof value !== "string") throw new Error("voice session unavailable");
  return { value };
}

export function createBrowserCallDeps(overrides: Partial<CallDeps> = {}): CallDeps {
  return {
    fetchToken: fetchVoiceToken,
    connect: connectRealtime,
    startAudio: startBrowserAudio,
    instructions: defaultInstructions,
    triage: fetchVoiceTriage,
    keyterms: defaultKeyterms,
    tuning: defaultTuning,
    // Monotonic: a wall-clock rollback must not rearm the call cap.
    now: () => performance.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(Number(handle)),
    ...overrides,
  };
}

// Tests inject fake audio and socket. The mock token opens no xAI socket.
export function createMockCall(overrides: Partial<CallDeps> = {}): LiveCallController {
  return createLiveCall(
    createBrowserCallDeps({
      fetchToken: () => Promise.resolve({ value: mockSecretValue }),
      ...overrides,
    }),
  );
}
