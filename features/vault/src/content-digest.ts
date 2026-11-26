export async function digestContent(content: Uint8Array): Promise<string | null> {
  try {
    const snapshot = new Uint8Array(content);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", snapshot);
    return Array.from(
      new Uint8Array(digest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}
