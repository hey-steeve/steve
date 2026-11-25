import { parseServerEvent } from "./index.ts";
import { expect, it } from "vitest";

it("parses well-formed events", () => {
  expect(parseServerEvent({ type: "session.created", session: { id: "s1" } })).toEqual({
    type: "session.created",
    sessionId: "s1",
  });
  expect(parseServerEvent({ type: "session.updated" })).toEqual({ type: "session.updated" });
  expect(
    parseServerEvent({ type: "input_audio_buffer.speech_started", item_id: "i1" }),
  ).toEqual({ type: "input.speech_started", itemId: "i1" });
  expect(parseServerEvent({ type: "input_audio_buffer.speech_stopped" })).toEqual({
    type: "input.speech_stopped",
    itemId: undefined,
  });
  expect(
    parseServerEvent({
      type: "conversation.item.input_audio_transcription.delta",
      item_id: "i1",
      delta: "bon",
    }),
  ).toEqual({ type: "input.transcription_updated", itemId: "i1", text: "bon" });
  expect(
    parseServerEvent({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "i1",
      transcript: "bonjour",
    }),
  ).toEqual({ type: "input.transcription_completed", itemId: "i1", text: "bonjour" });
  expect(parseServerEvent({ type: "response.created", response: { id: "r1" } })).toEqual({
    type: "response.created",
    responseId: "r1",
  });
  expect(
    parseServerEvent({
      type: "response.output_audio.delta",
      response_id: "r1",
      item_id: "i2",
      delta: "AAA=",
    }),
  ).toEqual({ type: "response.audio_delta", responseId: "r1", itemId: "i2", delta: "AAA=" });
  expect(parseServerEvent({ type: "response.done", response: { id: "r1" } })).toEqual({
    type: "response.done",
    responseId: "r1",
  });
  expect(parseServerEvent({ type: "response.cancelled" })).toEqual({
    type: "response.cancelled",
    responseId: undefined,
  });
  expect(parseServerEvent({ type: "error", error: { message: "boom" } })).toEqual({
    type: "error",
    message: "boom",
  });
});

it("returns undefined for malformed, empty and unknown input", () => {
  for (const raw of [
    undefined,
    null,
    "",
    "x",
    42,
    [],
    {},
    { type: 1 },
    { type: "unknown.event" },
    { type: "response.output_audio.delta", delta: 5 },
    { type: "input_audio_buffer.speech_started", item_id: 7 },
    { type: "conversation.item.input_audio_transcription.completed", item_id: "i" },
    { type: "error" },
  ]) {
    expect(parseServerEvent(raw)).toBeUndefined();
  }
});
