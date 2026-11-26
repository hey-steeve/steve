import {
  VOICE_MODEL,
  buildSessionConfig,
  parseServerEvent,
  type ServerEvent,
  type VoiceTuning,
} from "@steve/voice";
import { mockSecretValue } from "./session-secret";

export const REALTIME_URL = `wss://api.x.ai/v1/realtime?model=${VOICE_MODEL}`;
export const SUBPROTOCOL_PREFIX = "xai-client-secret.";
const OPEN = 1;
// RFC 6455 subprotocols are RFC 7230 tokens. Chromium echoes a rejected one in its exception.
const SUBPROTOCOL_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type SocketHandlers = Record<"open" | "error" | "close", () => void> & {
  message(data: unknown): void;
};
export type SocketLike = {
  readonly readyState: number;
  send(d: string | Uint8Array): void;
  close(): void;
};
export type SocketFactory = (
  url: string,
  subprotocols: string[],
  h: SocketHandlers,
) => SocketLike;

// Audio from the server. Binary frames carry no ids, so the hook supplies them.
export type InboundAudio = {
  bytes: Uint8Array;
  responseId: string | undefined;
  itemId: string | undefined;
};

export type RealtimeSocketOptions = {
  // Ephemeral client secret. Never log it.
  readonly token: string;
  readonly instructions: string;
  readonly keyterms: readonly string[];
  readonly tuning: VoiceTuning;
  readonly onEvent: (event: ServerEvent) => void;
  readonly onAudio: (audio: InboundAudio) => void;
  readonly onOpen?: () => void;
  readonly onError?: () => void;
  readonly onClose?: () => void;
  readonly createSocket?: SocketFactory;
};

export type RealtimeSocket = {
  // True for the mock token. No socket was opened.
  readonly mock: boolean;
  sendAudio(bytes: Uint8Array): void;
  cancelResponse(): void;
  truncate(itemId: string, playedMs: number): void;
  close(): void;
};

const browserSocket: SocketFactory = (url, protocols, handlers) => {
  const ws = new WebSocket(url, [...protocols]);
  ws.binaryType = "arraybuffer";
  ws.onopen = handlers.open;
  ws.onmessage = (event) => handlers.message(event.data);
  ws.onerror = handlers.error;
  ws.onclose = handlers.close;
  return {
    get readyState() {
      return ws.readyState;
    },
    // Copies so the frame never views a SharedArrayBuffer.
    send: (data) =>
      ws.send(typeof data === "string" ? data : new Uint8Array(data)),
    close: () => ws.close(),
  };
};

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array | undefined {
  try {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
}

// Opus: any non-empty frame. PCM16: a non-empty, even number of bytes.
function isValidAudio(bytes: Uint8Array, codec: VoiceTuning["codec"]): boolean {
  if (bytes.length === 0) return false;
  return codec === "opus" || bytes.length % 2 === 0;
}

const noop = (): void => undefined;
const inertSocket: RealtimeSocket = {
  mock: true,
  sendAudio: noop,
  cancelResponse: noop,
  truncate: noop,
  close: noop,
};

// A rejected token reports through onError only. No message carries the token.
const failedSocket: RealtimeSocket = { ...inertSocket, mock: false };

export function connectRealtime(
  options: RealtimeSocketOptions,
): RealtimeSocket {
  if (options.token === mockSecretValue) return inertSocket;
  const subprotocol = `${SUBPROTOCOL_PREFIX}${options.token}`;
  if (!SUBPROTOCOL_PATTERN.test(options.token)) {
    options.onError?.();
    return failedSocket;
  }
  const binary = options.tuning.transport === "binary";
  let closed = false;
  let socket: SocketLike | undefined;

  const send = (data: string | Uint8Array): void => {
    if (!closed && socket?.readyState === OPEN) socket.send(data);
  };
  const sendJson = (message: object): void => send(JSON.stringify(message));

  const handleText = (text: string): void => {
    let event: ServerEvent | undefined;
    try {
      event = parseServerEvent(JSON.parse(text));
    } catch {
      return;
    }
    if (event === undefined) return;
    let bytes: Uint8Array | undefined;
    if (event.type === "response.audio_delta") {
      // Binary transport carries audio in binary frames only.
      if (binary) return;
      // Invalid audio never reaches the reducer, so it cannot leave it speaking.
      bytes = fromBase64(event.delta);
      if (bytes === undefined || !isValidAudio(bytes, options.tuning.codec)) return;
    }
    options.onEvent(event);
    // onEvent may have closed the socket.
    if (closed || bytes === undefined || event.type !== "response.audio_delta")
      return;
    options.onAudio({
      bytes,
      responseId: event.responseId,
      itemId: event.itemId,
    });
  };

  try {
    socket = (options.createSocket ?? browserSocket)(
      REALTIME_URL,
      [subprotocol],
      {
        open: () => {
          if (closed) return;
          sendJson({
            type: "session.update",
            session: buildSessionConfig({
              instructions: options.instructions,
              keyterms: options.keyterms,
              tuning: options.tuning,
            }),
          });
          options.onOpen?.();
        },
        message: (data) => {
          if (closed) return;
          if (typeof data === "string") handleText(data);
          else if (binary && data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(data);
            if (!isValidAudio(bytes, options.tuning.codec)) return;
            options.onAudio({
              bytes,
              responseId: undefined,
              itemId: undefined,
            });
          }
        },
        error: () => !closed && options.onError?.(),
        close: () => {
          if (closed) return;
          closed = true;
          options.onClose?.();
        },
      },
    );
  } catch {
    // The constructor error can quote the subprotocol, so it is dropped.
    closed = true;
    options.onError?.();
    return failedSocket;
  }

  return {
    mock: false,
    sendAudio: (bytes) =>
      binary
        ? send(bytes)
        : sendJson({
            type: "input_audio_buffer.append",
            audio: toBase64(bytes),
          }),
    cancelResponse: () => sendJson({ type: "response.cancel" }),
    truncate: (itemId, playedMs) =>
      sendJson({
        type: "conversation.item.truncate",
        item_id: itemId,
        content_index: 0,
        audio_end_ms: Math.max(0, Math.round(playedMs)),
      }),
    close() {
      if (closed) return;
      closed = true;
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
    },
  };
}
