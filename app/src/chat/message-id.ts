export function newMessageId(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === "function") {
    try {
      return cryptoObject.randomUUID();
    } catch {
      return fallbackMessageId();
    }
  }
  return fallbackMessageId();
}

function fallbackMessageId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `msg-${time}-${rand}`;
}
