import { parseServerEvent } from "./index.ts";
import { expect, it } from "vitest";

it("parses well-formed events", () => {
  expect(parseServerEvent({ type: "session.created", session: { id: "s1" } })).toEqual({
    type: "session.created",
    sessionId: "s1",
  });
  expect(
    parseServerEvent({ type: "session.updated", session: { id: "s1", instructions: "Be brief" } }),
  ).toEqual({ type: "session.updated", sessionId: "s1", instructions: "Be brief" });
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
  expect(parseServerEvent({ type: "response.cancelled", response: { id: "r1" } })).toEqual({
    type: "response.cancelled",
    responseId: "r1",
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
    { type: "response.done", response: 7 },
    { type: "response.created", response: null },
    { type: "response.cancelled", response: "r1" },
    { type: "session.created" },
    { type: "response.done" },
    { type: "response.done", response: {} },
    { type: "response.done", response: { id: "" } },
    { type: "response.created" },
    { type: "response.cancelled", response: {} },
    { type: "session.created", session: null },
    { type: "session.created", session: "s1" },
    { type: "error", error: "boom" },
    { type: "conversation.item.input_audio_transcription.completed", item_id: "i", delta: "bon" },
    { type: "conversation.item.input_audio_transcription.completed", transcript: 5 },
    { type: "conversation.item.input_audio_transcription.delta", delta: 5 },
  ]) {
    expect(parseServerEvent(raw)).toBeUndefined();
  }
});

it("parses response.output_item.added and rejects missing or malformed ids", () => {
  expect(
    parseServerEvent({
      type: "response.output_item.added",
      response_id: "r1",
      item: { id: "i1" },
    }),
  ).toEqual({ type: "response.output_item_added", responseId: "r1", itemId: "i1" });
  for (const raw of [
    { type: "response.output_item.added", item: { id: "i1" } },
    { type: "response.output_item.added", response_id: "r1" },
    { type: "response.output_item.added", response_id: "r1", item: { id: 3 } },
    { type: "response.output_item.added", response_id: "r1", item: "i1" },
  ]) {
    expect(parseServerEvent(raw)).toBeUndefined();
  }
});

it("session.updated keeps instructions and session id and rejects a missing or null session", () => {
  expect(
    parseServerEvent({ type: "session.updated", session: { instructions: "Be brief" } }),
  ).toEqual({ type: "session.updated", sessionId: undefined, instructions: "Be brief" });
  for (const raw of [
    { type: "session.updated" },
    { type: "session.updated", session: null },
    { type: "session.updated", session: "s1" },
    { type: "session.updated", session: { instructions: 5 } },
  ]) {
    expect(parseServerEvent(raw)).toBeUndefined();
  }
});

it("BC-45: rejects output_item.added without response_id or item id, and done/cancelled without response id", () => {
  for (const raw of [
    { type: "response.output_item.added", item: { id: "i1" } },
    { type: "response.output_item.added", response_id: "r1" },
    { type: "response.output_item.added", response_id: "r1", item: {} },
    { type: "response.done", response: {} },
    { type: "response.cancelled" },
  ]) {
    expect(parseServerEvent(raw)).toBeUndefined();
  }
});

it("drops a JSON audio delta without a response id", () => {
  for (const type of ["response.output_audio.delta", "response.audio.delta"]) {
    expect(parseServerEvent({ type, item_id: "i1", delta: "AAA=" })).toBeUndefined();
    expect(parseServerEvent({ type, delta: "AAA=" })).toBeUndefined();
  }
});
