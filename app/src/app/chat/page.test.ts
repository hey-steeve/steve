import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { chatRequestLimits } from "../../chat/request.js";
import ChatPage from "./page.js";

it("renders the profile button with aria-label Profil", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain('aria-label="Profil"');
});

it("limits the composer to the user message cap", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain(`maxLength="${chatRequestLimits.maxMessageChars}"`);
});
