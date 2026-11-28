import { expect, it } from "vitest";
import { defaultHomeLayout, moveBlock, normalizeLayout, toggleBlock, visibleBlocks } from "./home-layout";

it("moves blocks up and down and stops at the edges", () => {
  const down = moveBlock(defaultHomeLayout, "signal", 1);
  expect(down.order.slice(0, 2)).toEqual(["appointment", "signal"]);
  expect(moveBlock(defaultHomeLayout, "signal", -1)).toBe(defaultHomeLayout);
  expect(moveBlock(defaultHomeLayout, "tiles", 1)).toBe(defaultHomeLayout);
});

it("hides and shows blocks", () => {
  const hidden = toggleBlock(defaultHomeLayout, "space");
  expect(visibleBlocks(hidden)).not.toContain("space");
  expect(visibleBlocks(toggleBlock(hidden, "space"))).toEqual(defaultHomeLayout.order);
});

it("repairs a saved layout: drops unknown ids, dedupes, appends new blocks", () => {
  expect(normalizeLayout(null)).toEqual(defaultHomeLayout);
  const repaired = normalizeLayout({ order: ["tiles", "tiles", "nope", "signal"], hidden: ["space", 3] });
  expect(repaired.order).toEqual(["tiles", "signal", "appointment", "memory", "challenge", "space", "upcoming"]);
  expect(repaired.hidden).toEqual(["space"]);
});
