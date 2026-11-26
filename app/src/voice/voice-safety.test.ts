import { describe, expect, it } from "vitest";
import type { EmergencyCalls } from "@steve/triage";
import {
  call15Now,
  call3114,
  call3114Now,
} from "../app/api/chat/prompt-base.ts";
import { forcedSentences } from "./voice-safety";

const c15 = { type: "call", number: "15" } as const;
const c3114 = { type: "call", number: "3114" } as const;

describe("forcedSentences", () => {
  it.each<[string, EmergencyCalls, string[]]>([
    ["15 only", [c15], [call15Now]],
    ["3114 only", [c3114], [call3114Now]],
    ["3114 then 15", [c3114, c15], [call3114Now, call15Now]],
    ["15 then 3114", [c15, c3114], [call15Now, call3114]],
  ])("%s", (_name, calls, expected) => {
    expect([...forcedSentences(calls)]).toEqual(expected);
  });

  it("uses distinct canonical sentences", () => {
    expect(new Set([call15Now, call3114Now, call3114]).size).toBe(3);
  });
});
