import { expect, expectTypeOf, it } from "vitest";
import { turnChannels } from "./index.js";
import type { FeatureResult, Handoff, Turn, TurnChannel } from "./index.js";

it("lists voice and text as the turn channels", () => {
  const turns = turnChannels.map((channel) => {
    const turn = {
      sessionId: "session-1",
      turnId: "turn-1",
      channel,
      text: "hello",
    } satisfies Turn;
    return turn.channel;
  });

  expect(turns).toEqual(["voice", "text"]);
  expectTypeOf<TurnChannel>().toEqualTypeOf<"voice" | "text">();
  expectTypeOf<"voice">().toMatchTypeOf<TurnChannel>();
  expectTypeOf<"text">().toMatchTypeOf<TurnChannel>();
  expectTypeOf<"sms">().not.toMatchTypeOf<TurnChannel>();
  expectTypeOf<string>().not.toMatchTypeOf<TurnChannel>();
});

it("describes a turn as a session, a turn id, a channel, and text", () => {
  expectTypeOf<Turn>().branded.toEqualTypeOf<{
    readonly sessionId: string;
    readonly turnId: string;
    readonly channel: TurnChannel;
    readonly text: string;
  }>();
});

it("describes a handoff as a session, a turn, a target, an intent, and data", () => {
  expectTypeOf<Handoff["sessionId"]>().toEqualTypeOf<string>();
  expectTypeOf<Handoff["turnId"]>().toEqualTypeOf<string>();
  expectTypeOf<Handoff["target"]>().toEqualTypeOf<string>();
  expectTypeOf<Handoff["intent"]>().toEqualTypeOf<string>();
  expectTypeOf<Handoff["data"]>().toEqualTypeOf<unknown>();
  expectTypeOf<Handoff["data"]>().not.toBeAny();
  expectTypeOf<Handoff<{ id: string }>["data"]>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<Handoff<{ id: string }>>().branded.toEqualTypeOf<{
    readonly sessionId: string;
    readonly turnId: string;
    readonly target: string;
    readonly intent: string;
    readonly data: { id: string };
  }>();
});

it("returns data when a feature result succeeds and omits it when the result fails", () => {
  expectTypeOf<Extract<FeatureResult<{ id: string }>, { ok: true }>>().branded.toEqualTypeOf<{
    readonly ok: true;
    readonly reply: string;
    readonly data?: { id: string };
  }>();
  expectTypeOf<Extract<FeatureResult<{ id: string }>, { ok: false }>>().branded.toEqualTypeOf<{
    readonly ok: false;
    readonly reply: string;
  }>();
  expectTypeOf<Extract<FeatureResult<{ id: string }>, { ok: false }>>().not.toHaveProperty(
    "data",
  );
});

it("types successful feature data as the payload or undefined", () => {
  expectTypeOf<Extract<FeatureResult<{ id: string }>, { ok: true }>["data"]>().toEqualTypeOf<
    { id: string } | undefined
  >();
});

it("keeps data optional on success and accepts a feature with no payload", () => {
  expectTypeOf<Extract<FeatureResult, { ok: true }>>().branded.toEqualTypeOf<{
    readonly ok: true;
    readonly reply: string;
    readonly data?: unknown;
  }>();
  expectTypeOf<Extract<FeatureResult<undefined>, { ok: true }>>().branded.toEqualTypeOf<{
    readonly ok: true;
    readonly reply: string;
    readonly data?: undefined;
  }>();
});
