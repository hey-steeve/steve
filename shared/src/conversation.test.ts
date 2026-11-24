import { expect, expectTypeOf, it } from "vitest";
import { turnSources } from "./index.js";
import type { FeatureResult, Handoff, Turn, TurnSource } from "./index.js";

it("lists voice and text as the turn sources", () => {
  const turns = turnSources.map((source) => {
    const turn = {
      sessionId: "session-1",
      source,
      text: "hello",
    } satisfies Turn;
    return turn.source;
  });

  expect(turns).toEqual(["voice", "text"]);
  expectTypeOf<TurnSource>().toEqualTypeOf<(typeof turnSources)[number]>();
  expectTypeOf<TurnSource>().toEqualTypeOf<"voice" | "text">();
  expectTypeOf<"voice">().toMatchTypeOf<TurnSource>();
  expectTypeOf<"text">().toMatchTypeOf<TurnSource>();
  expectTypeOf<"sms">().not.toMatchTypeOf<TurnSource>();
  expectTypeOf<string>().not.toMatchTypeOf<TurnSource>();
});

it("describes a turn as a session, a source, and text", () => {
  expectTypeOf<Turn>().branded.toEqualTypeOf<{
    readonly sessionId: string;
    readonly source: TurnSource;
    readonly text: string;
  }>();
});

it("describes a handoff as a target, an intent, and data", () => {
  expectTypeOf<Handoff["target"]>().toEqualTypeOf<string>();
  expectTypeOf<Handoff["intent"]>().toEqualTypeOf<string>();
  expectTypeOf<Handoff["data"]>().toEqualTypeOf<unknown>();
  expectTypeOf<Handoff["data"]>().not.toBeAny();
  expectTypeOf<Handoff<{ id: string }>["data"]>().toEqualTypeOf<{ id: string }>();
  expectTypeOf<Handoff<{ id: string }>>().branded.toEqualTypeOf<{
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

it("reads feature data only from a successful result", () => {
  const success = {
    ok: true,
    reply: "Stored.",
    data: { id: "1" },
  } satisfies FeatureResult<{ id: string }>;
  const noted = {
    ok: true,
    reply: "Noted.",
  } satisfies FeatureResult<{ id: string }>;
  const failure = {
    ok: false,
    reply: "Not stored.",
  } satisfies FeatureResult<{ id: string }>;

  expectTypeOf<Extract<FeatureResult<{ id: string }>, { ok: true }>["data"]>().toEqualTypeOf<
    { id: string } | undefined
  >();
  expect(readData(success)).toEqual({ id: "1" });
  expect(readData(noted)).toBeUndefined();
  expect(readData(failure)).toBeUndefined();
});

it("returns a reply and no data when a feature has no payload", () => {
  const plain = {
    ok: true,
    reply: "Done.",
  } satisfies FeatureResult;
  const empty = {
    ok: true,
    reply: "Done.",
  } satisfies FeatureResult<undefined>;

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
  expect(plain).toEqual({ ok: true, reply: "Done." });
  expect(empty).toEqual({ ok: true, reply: "Done." });
  expect(readData(plain)).toBeUndefined();
  expect(readData(empty)).toBeUndefined();
});

function readData<Data>(result: FeatureResult<Data>): Data | undefined {
  if (result.ok) {
    return result.data;
  }
  return undefined;
}
