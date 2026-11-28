// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { joinChallenge, resetCommunity, updateCommunity } from "../../community/store";
import { ProfileChallenges, ProfileInvite } from "./profile-community.js";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const roots: Root[] = [];

beforeEach(() => {
  resetCommunity();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.replaceChildren();
});

async function mount(node: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  return container;
}

it("shows challenge stats, the current challenge and past rewards", async () => {
  updateCommunity((state) => joinChallenge(state, "sleep-7x7", ["Léa"]));
  const view = await mount(createElement(ProfileChallenges));
  expect(view.querySelector("h2")?.textContent).toBe("My challenges");
  expect(view.textContent).toContain("200Berries");
  expect(view.textContent).toContain("Sleep 7 × 7 · with Léa");
  expect(view.textContent).toContain("+150");
});

it("offers a referral code that works outside Alan", async () => {
  const view = await mount(createElement(ProfileInvite));
  expect(view.textContent).toContain("Even if they’re not with Alan");
  expect(view.textContent).toContain("STEVIE-7X7");
  expect(view.querySelector("button")?.textContent).toContain("Share");
});
