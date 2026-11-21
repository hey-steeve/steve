import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Page from "./page.js";

it("labels the marmot page in French", () => {
  const html = renderToStaticMarkup(createElement(Page));
  expect(html).toContain(">Marmotte<");
  expect(html).toContain(">Discussion<");
  expect(html).toContain('aria-label="Instants"');
});
