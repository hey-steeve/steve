import { flushSync } from "react-dom";

// Test helper: the home has no composer, so open "Écrire à Stevie" from the
// avatar menu before looking for the field. A no-op inside a conversation.
export function writingField(container: ParentNode): Element | null {
  const existing = container.querySelector(".chat-field");
  if (existing !== null) return existing;
  const steve = container.querySelector('button[aria-label="Parler à Stevie"]');
  if (!(steve instanceof HTMLButtonElement)) return null;
  flushSync(() => {
    steve.click();
  });
  const write = container.querySelector(".chat-home-steve-item");
  if (!(write instanceof HTMLButtonElement)) return null;
  flushSync(() => {
    write.click();
  });
  return container.querySelector(".chat-field");
}
