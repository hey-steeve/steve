import { clampAssistantContent } from "./request";

export function readCompletion(
  payload: unknown,
  requested: string,
): { readonly reply: string; readonly model: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const choices = field(payload, "choices");
  if (!Array.isArray(choices)) {
    return null;
  }
  const first: unknown = choices[0];
  if (!isRecord(first)) {
    return null;
  }
  const message = field(first, "message");
  if (!isRecord(message)) {
    return null;
  }
  const content = field(message, "content");
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }
  const finish = field(first, "finish_reason");
  if (finish === "content_filter" || finish === "error") {
    return null;
  }
  const reply =
    finish === "length" ? lengthReply(content) : clampAssistantContent(content);
  if (reply === null) {
    return null;
  }
  const modelField = field(payload, "model");
  const model =
    typeof modelField === "string" && modelField.length > 0
      ? modelField
      : requested;
  return { reply, model };
}

function lengthReply(content: string): string | null {
  const sentence = completeSentences(content);
  if (sentence === null) {
    return null;
  }
  const bounded = clampAssistantContent(sentence);
  if (bounded === sentence) {
    return bounded;
  }
  return completeSentences(bounded);
}

function completeSentences(content: string): string | null {
  const text = content.trim();
  let end = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char !== "." && char !== "!" && char !== "?") {
      continue;
    }
    if (char === "." && isListMarkerDot(text, index)) {
      continue;
    }
    const closer = closingGuillemet(text, index + 1);
    if (closer !== null) {
      end = closer;
      continue;
    }
    const next = text.charAt(index + 1);
    if (next.length === 0 || next.trim() === "") {
      end = index + 1;
    }
  }
  if (end < 0) {
    return null;
  }
  const sentence = text.slice(0, end).trim();
  if (sentence.length === 0) {
    return null;
  }
  return sentence;
}

function isListMarkerDot(text: string, dotIndex: number): boolean {
  const lineStart = lineStartAt(text, dotIndex);
  const digits = listMarkerDigits(text, lineStart);
  if (digits === null || lineStart + digits.length !== dotIndex) {
    return false;
  }
  return isListItemAt(text, lineStart);
}

function isListItemAt(text: string, lineStart: number): boolean {
  let start: number | null = lineStart;
  let expected: number | null = null;
  while (start !== null) {
    const digits = listMarkerDigits(text, start);
    if (digits === null) {
      return false;
    }
    const value = Number.parseInt(digits, 10);
    if (expected !== null && value !== expected) {
      return false;
    }
    if (value === 1) {
      return true;
    }
    expected = value - 1;
    start = previousNonEmptyLineStart(text, start);
  }
  return false;
}

function listMarkerDigits(text: string, lineStart: number): string | null {
  const line = text.slice(lineStart, lineEndAt(text, lineStart));
  const digits = /^(\d+)\.(?=[^\S\n\r])/.exec(line)?.[1];
  if (digits === undefined) {
    return null;
  }
  return digits;
}

function lineStartAt(text: string, index: number): number {
  let cursor = index;
  while (cursor > 0) {
    const prev = text.charAt(cursor - 1);
    if (prev === "\n" || prev === "\r") {
      break;
    }
    cursor -= 1;
  }
  return cursor;
}

function lineEndAt(text: string, lineStart: number): number {
  let cursor = lineStart;
  while (cursor < text.length) {
    const char = text.charAt(cursor);
    if (char === "\n" || char === "\r") {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function previousNonEmptyLineStart(text: string, lineStart: number): number | null {
  let start = previousLineStart(text, lineStart);
  while (start !== null) {
    if (text.slice(start, lineEndAt(text, start)).trim().length > 0) {
      return start;
    }
    start = previousLineStart(text, start);
  }
  return null;
}

function previousLineStart(text: string, lineStart: number): number | null {
  if (lineStart === 0) {
    return null;
  }
  let cursor = lineStart - 1;
  if (text.charAt(cursor) === "\n") {
    cursor -= 1;
  }
  if (cursor >= 0 && text.charAt(cursor) === "\r") {
    cursor -= 1;
  }
  if (cursor < 0) {
    return null;
  }
  const char = text.charAt(cursor);
  if (char === "\n" || char === "\r") {
    return cursor + 1;
  }
  return lineStartAt(text, cursor);
}

function closingGuillemet(text: string, from: number): number | null {
  let cursor = from;
  while (cursor < text.length && text.charAt(cursor).trim() === "") {
    cursor += 1;
  }
  if (text.charAt(cursor) !== "»") {
    return null;
  }
  return cursor + 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  return Reflect.get(record, key);
}
