import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ChatPage from "./page.js";

it("renders the profile button with aria-label Profil", () => {
  const html = renderToStaticMarkup(createElement(ChatPage));
  expect(html).toContain('aria-label="Profil"');
});
