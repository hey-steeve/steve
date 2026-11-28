import { flushSync } from "react-dom";

// Test helper: the home has no composer, so tap Stevie in the tab bar, which
// opens the chat bar, before looking for the field. A no-op inside a
// conversation.
export function writingField(container: ParentNode): Element | null {
  const existing = container.querySelector(".chat-field");
  if (existing !== null) return existing;
  const steve = container.querySelector('button[aria-label="Talk to Stevie"]');
  if (!(steve instanceof HTMLButtonElement)) return null;
  flushSync(() => {
    steve.click();
  });
  return container.querySelector(".chat-field");
}
