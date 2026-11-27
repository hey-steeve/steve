import { describe, expect, it, vi } from "vitest";
import type { FeatureResult, Handoff, Turn } from "@steve/shared";
import { createConversation } from "./state.ts";
import {
  FALLBACK_CLARIFY_REPLY,
  FALLBACK_HANDOFF_ERROR_REPLY,
  handleConversationTurn,
} from "./orchestrator.ts";
import type { ConversationDeps } from "./orchestrator.ts";

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    sessionId: "sess-1",
    turnId: "t-1",
    channel: "text",
    text: "Je cherche un dermatologue secteur 1 à Paris",
    ...overrides,
  };
}

describe("handleConversationTurn", () => {
  it("runs identical handoff flow on voice and text channels", async () => {
    for (const channel of ["voice", "text"] as const) {
      const state = createConversation("sess-1", channel);
      const seenHandoffs: Handoff[] = [];

      const deps: ConversationDeps = {
        triageGate: async () => ({ status: "continue" }),
        resolveIntent: async () => ({
          kind: "handoff",
          target: "directory",
          intent: "find-practitioner",
          data: { specialty: "dermatologue", postalCode: "75011" },
        }),
        dispatchHandoff: async (handoff): Promise<FeatureResult> => {
          seenHandoffs.push(handoff);
          return {
            ok: true,
            reply: "J'ai trouvé deux dermatologues près de chez toi.",
            data: { count: 2 },
          };
        },
      };

      const { state: next, outcome } = await handleConversationTurn(
        state,
        makeTurn({ channel }),
        deps,
      );

      expect(outcome.kind).toBe("handoff-result");
      if (outcome.kind === "handoff-result") {
        expect(outcome.handoff.target).toBe("directory");
        expect(outcome.result.ok).toBe(true);
        expect(outcome.result.reply).toBe("J'ai trouvé deux dermatologues près de chez toi.");
      }
      expect(seenHandoffs).toHaveLength(1);
      expect(next.phase).toBe("handed-off");
      expect(next.messages).toHaveLength(2);
    }
  });

  it("stops immediately on emergency referral and never calls intent or booking handoff", async () => {
    const state = createConversation("sess-1", "voice");
    const resolveIntent = vi.fn();
    const dispatchHandoff = vi.fn();
    const triageSpy = vi.fn(async () => ({
      status: "emergency" as const,
      calls: ["15"] as const,
      reply: "Appelle le 15 maintenant.",
    }));

    const { state: next, outcome } = await handleConversationTurn(
      state,
      makeTurn({ channel: "voice", text: "J'ai très mal à la poitrine" }),
      {
        triageGate: triageSpy,
        resolveIntent,
        dispatchHandoff,
      },
    );

    expect(outcome).toEqual({
      kind: "emergency-referral",
      calls: ["15"],
      reply: "Appelle le 15 maintenant.",
    });
    expect(next.phase).toBe("emergency-referred");
    expect(next.endedReason).toBe("emergency");
    expect(resolveIntent).not.toHaveBeenCalled();
    expect(dispatchHandoff).not.toHaveBeenCalled();
  });

  it("passes only patient turns to triageGate across multi-turn conversations (BC-16)", async () => {
    let state = createConversation("sess-1", "text");
    const seenHistories: (readonly string[])[] = [];

    const deps: ConversationDeps = {
      triageGate: async ({ patientHistory }) => {
        seenHistories.push(patientHistory);
        return { status: "continue" };
      },
      resolveIntent: async () => ({
        kind: "clarify",
        reply: "Dans quel arrondissement cherches-tu ?",
      }),
      dispatchHandoff: async () => ({ ok: true, reply: "OK" }),
    };

    const r1 = await handleConversationTurn(state, makeTurn({ turnId: "t-1", text: "Bonjour" }), deps);
    state = r1.state;
    await handleConversationTurn(state, makeTurn({ turnId: "t-2", text: "Paris 11" }), deps);

    expect(seenHistories).toEqual([["Bonjour"], ["Bonjour", "Paris 11"]]);
  });

  it("keeps the patient informed with fallback replies when ports throw", async () => {
    const state = createConversation("sess-1", "text");

    const triageFail = await handleConversationTurn(state, makeTurn({ turnId: "t-1" }), {
      triageGate: async () => {
        throw new Error("jev down");
      },
      resolveIntent: vi.fn(),
      dispatchHandoff: vi.fn(),
    });
    expect(triageFail.outcome).toEqual({
      kind: "clarify",
      reply: FALLBACK_CLARIFY_REPLY,
    });

    const dispatchFail = await handleConversationTurn(state, makeTurn({ turnId: "t-2" }), {
      triageGate: async () => ({ status: "continue" }),
      resolveIntent: async () => ({
        kind: "handoff",
        target: "directory",
        intent: "find-practitioner",
        data: {},
      }),
      dispatchHandoff: async () => {
        throw new Error("directory down");
      },
    });
    expect(dispatchFail.outcome.kind).toBe("handoff-result");
    if (dispatchFail.outcome.kind === "handoff-result") {
      expect(dispatchFail.outcome.result).toEqual({
        ok: false,
        reply: FALLBACK_HANDOFF_ERROR_REPLY,
      });
    }
    expect(dispatchFail.state.phase).toBe("listening");
    expect(dispatchFail.state.activeHandoff).toBeUndefined();
  });

  it("rejects invalid turns without calling any port and supports clean session end", async () => {
    const state = createConversation("sess-1", "text");
    const triageGate = vi.fn();
    const invalid = await handleConversationTurn(
      state,
      makeTurn({ sessionId: "other-session" }),
      {
        triageGate,
        resolveIntent: vi.fn(),
        dispatchHandoff: vi.fn(),
      },
    );
    expect(invalid.outcome).toEqual({ kind: "invalid-turn", reason: "session-mismatch" });
    expect(triageGate).not.toHaveBeenCalled();

    const ended = await handleConversationTurn(state, makeTurn({ turnId: "t-end", text: "Merci au revoir" }), {
      triageGate: async () => ({ status: "continue" }),
      resolveIntent: async () => ({ kind: "end", reply: "À bientôt, prends soin de toi." }),
      dispatchHandoff: vi.fn(),
    });
    expect(ended.outcome).toEqual({ kind: "ended", reply: "À bientôt, prends soin de toi." });
    expect(ended.state.phase).toBe("ended");
  });

  it("keeps running triageGate after an emergency referral and lets a new emergency through (15 then 3114)", async () => {
    const initial = createConversation("sess-1", "voice");
    const resolveIntent = vi.fn();
    const dispatchHandoff = vi.fn();
    const triageGate = vi
      .fn<ConversationDeps["triageGate"]>()
      .mockResolvedValueOnce({
        status: "emergency",
        calls: ["15"],
        reply: "Appelle le 15 maintenant.",
      })
      .mockResolvedValueOnce({
        status: "emergency",
        calls: ["3114"],
        reply: "Appelle le 3114 maintenant.",
      });

    const deps: ConversationDeps = { triageGate, resolveIntent, dispatchHandoff };

    const first = await handleConversationTurn(
      initial,
      makeTurn({ channel: "voice", turnId: "t-1", text: "J'ai mal à la poitrine" }),
      deps,
    );
    expect(first.outcome).toEqual({
      kind: "emergency-referral",
      calls: ["15"],
      reply: "Appelle le 15 maintenant.",
    });
    expect(first.state.phase).toBe("emergency-referred");

    const second = await handleConversationTurn(
      first.state,
      makeTurn({ channel: "voice", turnId: "t-2", text: "Je n'en peux plus, je veux en finir" }),
      deps,
    );
    expect(second.outcome).toEqual({
      kind: "emergency-referral",
      calls: ["3114"],
      reply: "Appelle le 3114 maintenant.",
    });
    expect(second.state.phase).toBe("emergency-referred");
    expect(triageGate).toHaveBeenCalledTimes(2);
    expect(triageGate).toHaveBeenLastCalledWith({
      sessionId: "sess-1",
      turnId: "t-2",
      channel: "voice",
      patientHistory: ["J'ai mal à la poitrine", "Je n'en peux plus, je veux en finir"],
    });
    expect(resolveIntent).not.toHaveBeenCalled();
    expect(dispatchHandoff).not.toHaveBeenCalled();
  });

  it("runs the normal flow for a booking request after a 15 referral", async () => {
    const initial = createConversation("sess-1", "text");
    const seenHandoffs: Handoff[] = [];
    const resolveIntent = vi.fn<ConversationDeps["resolveIntent"]>(async () => ({
      kind: "handoff",
      target: "booking",
      intent: "book-appointment",
      data: { specialty: "dermatologue" },
    }));
    const dispatchHandoff = vi.fn(async (handoff: Handoff): Promise<FeatureResult> => {
      seenHandoffs.push(handoff);
      return { ok: true, reply: "Je m'occupe de ton rendez-vous." };
    });
    const triageGate = vi
      .fn<ConversationDeps["triageGate"]>()
      .mockResolvedValueOnce({
        status: "emergency",
        calls: ["15"],
        reply: "Appelle le 15 maintenant.",
      })
      .mockResolvedValueOnce({ status: "continue" });

    const deps: ConversationDeps = { triageGate, resolveIntent, dispatchHandoff };

    const first = await handleConversationTurn(
      initial,
      makeTurn({ turnId: "t-1", text: "J'ai mal à la poitrine" }),
      deps,
    );
    expect(first.state.phase).toBe("emergency-referred");

    const second = await handleConversationTurn(
      first.state,
      makeTurn({ turnId: "t-2", text: "Prends-moi un rendez-vous chez un dermato" }),
      deps,
    );

    expect(triageGate).toHaveBeenCalledTimes(2);
    expect(resolveIntent).toHaveBeenCalledTimes(1);
    expect(dispatchHandoff).toHaveBeenCalledTimes(1);
    expect(seenHandoffs[0]?.target).toBe("booking");
    expect(second.outcome.kind).toBe("handoff-result");
    expect(second.state.phase).toBe("handed-off");
    expect(second.state.activeHandoff?.target).toBe("booking");
    expect(second.state.endedReason).toBeUndefined();
  });
});
