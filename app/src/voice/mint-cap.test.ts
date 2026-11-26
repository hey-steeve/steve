import { describe, expect, it } from "vitest";
import { createMintCap, mintCapLimit, mintCapMaxKeys, mintCapWindowMs } from "./mint-cap";

describe("mint cap key bound", () => {
  it("never stores more keys than the maximum under many distinct IPs", () => {
    const cap = createMintCap();
    let withinBound = true;
    for (let i = 0; i < mintCapMaxKeys * 2 + 50; i += 1) {
      cap.admit(`10.0.${Math.floor(i / 250)}.${i % 250}`, 1000);
      withinBound = withinBound && cap.size() <= mintCapMaxKeys;
    }
    expect(withinBound).toBe(true);
    expect(cap.size()).toBe(mintCapMaxKeys);
  });

  it("prefers expired keys over live ones when evicting", () => {
    const cap = createMintCap(mintCapLimit, mintCapWindowMs, 3);
    const liveAt = 50_000;
    const newAt = mintCapWindowMs + 1000;
    let oldestFilled = true;
    for (let i = 0; i < mintCapLimit; i += 1) {
      oldestFilled = oldestFilled && cap.admit("live-oldest", liveAt);
    }
    cap.admit("expired-middle", 0);
    cap.admit("live-third", liveAt + 5000);
    expect(oldestFilled).toBe(true);
    expect(cap.size() === 3).toBe(true);
    cap.admit("brand-new", newAt);
    expect(cap.size() === 3).toBe(true);
    expect(cap.admit("live-oldest", newAt)).toBe(false);
  });

  it("evicts the oldest live key when none are expired", () => {
    const cap = createMintCap(mintCapLimit, mintCapWindowMs, 2);
    cap.admit("a", 1);
    cap.admit("b", 2);
    cap.admit("c", 3);
    expect(cap.size()).toBe(2);
    let aAdmitted = 0;
    for (let i = 0; i < mintCapLimit; i += 1) {
      if (cap.admit("a", 4)) {
        aAdmitted += 1;
      }
    }
    expect(aAdmitted === mintCapLimit).toBe(true);
  });

  it("keeps counting a retained IP toward its window", () => {
    const cap = createMintCap(mintCapLimit, mintCapWindowMs, 5);
    for (let i = 0; i < mintCapLimit - 1; i += 1) {
      cap.admit("keep", 100);
    }
    cap.admit("other-1", 101);
    cap.admit("other-2", 101);
    expect(cap.admit("keep", 102)).toBe(true);
    expect(cap.admit("keep", 103)).toBe(false);
    expect(cap.admit("other-1", 103)).toBe(true);
  });
});
