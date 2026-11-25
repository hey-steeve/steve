export type ServerEvent =
  | { readonly type: "session.created"; readonly sessionId: string | undefined }
  | { readonly type: "session.updated" }
  | {
      readonly type: "input.speech_started";
      readonly itemId: string | undefined;
    }
  | {
      readonly type: "input.speech_stopped";
      readonly itemId: string | undefined;
    }
  | {
      readonly type: "input.transcription_updated";
      readonly itemId: string | undefined;
      readonly text: string;
    }
  | {
      readonly type: "input.transcription_completed";
      readonly itemId: string | undefined;
      readonly text: string;
    }
  | { readonly type: "response.created"; readonly responseId: string | undefined }
  | {
      readonly type: "response.audio_delta";
      readonly responseId: string | undefined;
      readonly itemId: string | undefined;
      readonly delta: string;
    }
  | { readonly type: "response.done"; readonly responseId: string | undefined }
  | {
      readonly type: "response.cancelled";
      readonly responseId: string | undefined;
    }
  | { readonly type: "error"; readonly message: string };

type Obj = { readonly [key: string]: unknown };

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

// A present field with the wrong type makes the whole event malformed.
const optId = (o: Obj, key: string): string | undefined | null => {
  const v = o[key];
  if (v === undefined) return undefined;
  return str(v) ?? null;
};

const nested = (o: Obj, key: string): Obj => {
  const v = o[key];
  return isObj(v) ? v : {};
};

function parseObject(o: Obj): ServerEvent | undefined {
  const type = o["type"];
  switch (type) {
    case "session.created": {
      const id = optId(nested(o, "session"), "id");
      return id === null ? undefined : { type: type, sessionId: id };
    }
    case "session.updated":
      return { type };
    case "input_audio_buffer.speech_started":
    case "input_audio_buffer.speech_stopped": {
      const itemId = optId(o, "item_id");
      if (itemId === null) return undefined;
      return {
        type:
          type === "input_audio_buffer.speech_started"
            ? "input.speech_started"
            : "input.speech_stopped",
        itemId,
      };
    }
    case "conversation.item.input_audio_transcription.delta":
    case "conversation.item.input_audio_transcription.updated":
    case "conversation.item.input_audio_transcription.completed": {
      const itemId = optId(o, "item_id");
      const text = o["transcript"] ?? o["delta"];
      if (itemId === null || typeof text !== "string") return undefined;
      return {
        type: type.endsWith(".completed")
          ? "input.transcription_completed"
          : "input.transcription_updated",
        itemId,
        text,
      };
    }
    case "response.created":
    case "response.done":
    case "response.cancelled": {
      const responseId = optId(nested(o, "response"), "id");
      return responseId === null ? undefined : { type, responseId };
    }
    case "response.output_audio.delta":
    case "response.audio.delta": {
      const responseId = optId(o, "response_id");
      const itemId = optId(o, "item_id");
      const delta = o["delta"];
      if (responseId === null || itemId === null) return undefined;
      if (typeof delta !== "string") return undefined;
      return { type: "response.audio_delta", responseId, itemId, delta };
    }
    case "error": {
      const message = str(nested(o, "error")["message"]);
      return message === undefined ? undefined : { type, message };
    }
    default:
      return undefined;
  }
}

export function parseServerEvent(raw: unknown): ServerEvent | undefined {
  try {
    return isObj(raw) ? parseObject(raw) : undefined;
  } catch {
    return undefined;
  }
}
