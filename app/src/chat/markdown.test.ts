import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ChatMarkdown } from "./markdown.js";

function render(text: string): string {
  return renderToStaticMarkup(createElement(ChatMarkdown, { text }));
}

it("renders emphasis, lists, paragraphs, and line breaks without raw html", () => {
  expect(render("**gras** et *italique*")).toBe(
    "<p><strong>gras</strong> et <em>italique</em></p>",
  );
  expect(render("Une ligne\nla suivante")).toBe("<p>Une ligne<br/>la suivante</p>");
  expect(render("Premier\n\nSecond")).toBe("<p>Premier</p><p>Second</p>");
  expect(render("- **un**\n- deux")).toBe(
    "<ul><li><strong>un</strong></li><li>deux</li></ul>",
  );
  expect(render("1. un\n2. *deux*")).toBe(
    "<ol><li>un</li><li><em>deux</em></li></ol>",
  );
  expect(render("<script>alert(1)</script>")).toBe(
    "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  );
});
