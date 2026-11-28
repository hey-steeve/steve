// @vitest-environment happy-dom

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { FeatureShell, featureNavItems } from "./feature-shell.js";
import { appTabs } from "./tab-bar.js";

const appRoutesDir = path.dirname(fileURLToPath(import.meta.url));

function missingRouteFiles(
  items: readonly { readonly href: string }[],
  routesDir: string,
): string[] {
  const missing: string[] = [];
  for (const { href } of items) {
    const segment = href.replace(/^\/+/, "");
    const pagePath = path.join(routesDir, segment, "page.tsx");
    if (!existsSync(pagePath)) {
      missing.push(href);
    }
  }
  return missing;
}

it("renders the shared shell with back navigation and the app tab bar", () => {
  const html = renderToStaticMarkup(
    createElement(FeatureShell, {
      current: "/agenda",
      title: "Annuaire",
      badge: "Nouveau",
      headerMascot: { src: "/mascot/state-done.webp", width: 256, height: 256 },
      children: createElement("p", null, "Contenu"),
    }),
  );
  const host = document.createElement("div");
  host.innerHTML = html;
  expect(host.querySelector(".steve-back")?.getAttribute("href")).toBe("/chat");
  expect(host.querySelector("h1")?.textContent).toBe("Annuaire");
  expect(host.querySelector(".steve-pill")?.textContent).toBe("Nouveau");
  expect(host.querySelector(".steve-header-mascot")?.getAttribute("src")).toBe(
    "/mascot/state-done.webp",
  );
  const current = host.querySelector('.app-tab[aria-current="page"]');
  expect(current?.getAttribute("href")).toBe("/agenda");
  expect(host.querySelector(".app-tabbar-floating .app-tab-fab")?.getAttribute("href")).toBe("/chat");
  expect(host.querySelector(".steve-nav")).toBeNull();
  expect(host.textContent).not.toContain("pas médecin");
});

it("links only to routes that have a page.tsx file on disk (BC-85)", () => {
  expect(missingRouteFiles(featureNavItems, appRoutesDir)).toEqual([]);
  expect(missingRouteFiles(appTabs, appRoutesDir)).toEqual([]);
  // Guard proof: a nonexistent route must be flagged by the same check.
  expect(
    missingRouteFiles(
      [...featureNavItems, { href: "/missing-route-proof" }],
      appRoutesDir,
    ),
  ).toEqual(["/missing-route-proof"]);
});
