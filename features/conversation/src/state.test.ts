import { describe, expect, it } from "vitest";
import type { Handoff, Turn } from "@steve/shared";
import {
  DEFAULT_GREETING,
  MAX_CONVERSATION_TURNS,
  MAX_TURN_TEXT_CHARS,
  createConversation,
  greetingForChannel,
  isTerminalPhase,
  markConversationEnded,
  markEmergencyReferred,
  patientTexts,
  recordAssistantReply,
  recordHandoff,
  recordPatientTurn,
  validateTurn,
} from "./state.ts";

describe("createConversation and greetings", () => {
  it("creates identical initial flow for voice and text channels", () => {
    const voice = createConversation("sess-1", "voice");
    const text = createConversation("sess-2", "text");

    expect(voice.phase).toBe("greeting");
    expect(text.phase).toBe("greeting");
    expect(voice.messages).toEqual([]);
    expect(text.messages).toEqual([]);
    expect(greetingForChannel("voice")).toBe(DEFAULT_GREETING);
    expect(greetingForChannel("text")).toBe(DEFAULT_GREETING);
  });

  it("rejects empty sessionId", () => {
    expect(() => createConversation("   ", "text")).toThrow();
  });
});

describe("validateTurn", () => {
  it("accepts a valid turn and trims text", () => {
    const state = createConversation("sess-1", "text");
    const turn: Turn = {
      sessionId: "sess-1",
      turnId: "t-1",
      channel: "text",
      text: "  Je cherche un médecin généraliste  ",
    };

    const result = validateTurn(turn, state);
    expect(result).toEqual({
      ok: true,
      turn: {
        sessionId: "sess-1",
        turnId: "t-1",
        channel: "text",
        text: "Je cherche un médecin généraliste",
      },
    });
  });

  it("rejects blank text, oversized text, session/channel mismatch, duplicates, and terminal sessions", () => {
    const state = createConversation("sess-1", "voice");

    expect(
      validateTurn({ sessionId: "sess-1", turnId: "t-1", channel: "voice", text: "   " }, state),
    ).toEqual({ ok: false, reason: "invalid-turn" });

    expect(
      validateTurn(
        {
          sessionId: "sess-1",
          turnId: "t-1",
          channel: "voice",
          text: "a".repeat(MAX_TURN_TEXT_CHARS + 1),
        },
        state,
      ),
    ).toEqual({ ok: false, reason: "invalid-turn" });

    expect(
      validateTurn({ sessionId: "sess-other", turnId: "t-1", channel: "voice", text: "Bonjour" }, state),
    ).toEqual({ ok: false, reason: "session-mismatch" });

    expect(
      validateTurn({ sessionId: "sess-1", turnId: "t-1", channel: "text", text: "Bonjour" }, state),
    ).toEqual({ ok: false, reason: "channel-mismatch" });

    const withTurn = recordPatientTurn(state, {
      sessionId: "sess-1",
      turnId: "t-1",
      channel: "voice",
      text: "Bonjour",
    });
    expect(
      validateTurn({ sessionId: "sess-1", turnId: "t-1", channel: "voice", text: "Encore" }, withTurn),
    ).toEqual({ ok: false, reason: "duplicate-turn" });

    const ended = markConversationEnded(withTurn, "t-1", "Au revoir.");
    expect(isTerminalPhase(ended.phase)).toBe(true);
    expect(
      validateTurn({ sessionId: "sess-1", turnId: "t-2", channel: "voice", text: "Allô" }, ended),
    ).toEqual({ ok: false, reason: "session-ended" });
  });
});

describe("state transitions and history bounds", () => {
  it("separates patient turns from assistant replies (BC-16) and bounds history (BC-17)", () => {
    let state = createConversation("sess-1", "text");
    for (let i = 0; i < MAX_CONVERSATION_TURNS + 10; i += 1) {
      state = recordPatientTurn(state, {
        sessionId: "sess-1",
        turnId: `t-${i}`,
        channel: "text",
        text: `patient-${i}`,
      });
      state = recordAssistantReply(state, `t-${i}`, `assistant-${i}`);
    }

    expect(state.messages.length).toBeLessThanOrEqual(MAX_CONVERSATION_TURNS * 2);
    const onlyPatient = patientTexts(state);
    expect(onlyPatient.every((t) => t.startsWith("patient-"))).toBe(true);
    expect(onlyPatient.some((t) => t.startsWith("assistant-"))).toBe(false);
  });

  it("clears activeHandoff when transitioning to emergency-referred", () => {
    let state = createConversation("sess-1", "voice");
    const handoff: Handoff = {
      sessionId: "sess-1",
      turnId: "t-1",
      target: "directory",
      intent: "find-practitioner",
      data: { specialty: "SM54" },
    };
    state = recordHandoff(state, handoff);
    expect(state.phase).toBe("handed-off");
    expect(state.activeHandoff).toEqual(handoff);

    const emergency = markEmergencyReferred(state, "t-2", "Urgence orientée.");
    expect(emergency.phase).toBe("emergency-referred");
    expect(emergency.endedReason).toBe("emergency");
    expect(emergency.activeHandoff).toBeUndefined();
    expect(isTerminalPhase(emergency.phase)).toBe(true);

    expect(recordHandoff(emergency, handoff)).toBe(emergency);
    expect(recordAssistantReply(emergency, "t-3", "Suite", "listening")).toBe(emergency);
    expect(
      recordPatientTurn(emergency, {
        sessionId: "sess-1",
        turnId: "t-3",
        channel: "voice",
        text: "Bonjour",
      }),
    ).toBe(emergency);
  });
});
