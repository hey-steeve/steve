import { describe, expect, it } from "vitest";
import { loadDemoPatientMemory } from "./demo-user.ts";
import {
  MAX_CALL_HISTORY,
  MAX_DECLARED_HISTORY,
  MAX_ENTRY_TEXT_CHARS,
  MAX_PREFERENCES,
  createInMemoryProfileStore,
} from "./store.ts";

describe("createInMemoryProfileStore", () => {
  it("initializes from the demo patient memory by default and returns isolated snapshots", () => {
    const store = createInMemoryProfileStore();
    const first = store.get();
    const second = store.get();

    expect(first).toEqual(loadDemoPatientMemory());
    expect(first).not.toBe(second);
    expect(first.preferences).not.toBe(second.preferences);
  });

  it("adds and removes preferences with trimming, deduplication, and bounds", () => {
    const store = createInMemoryProfileStore();
    const initialCount = store.get().preferences.length;

    const added = store.addPreference("  Rendez-vous le matin uniquement  ");
    expect(added.ok).toBe(true);
    if (added.ok) {
      expect(added.memory.preferences).toContain("Rendez-vous le matin uniquement");
      expect(added.memory.preferences).toHaveLength(initialCount + 1);
    }

    expect(store.addPreference("rendez-vous le matin uniquement")).toEqual({
      ok: false,
      reason: "duplicate",
    });
    expect(store.addPreference("   ")).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(store.addPreference("x".repeat(MAX_ENTRY_TEXT_CHARS + 1))).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const removed = store.removePreference("Rendez-vous le matin uniquement");
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(removed.memory.preferences).toHaveLength(initialCount);
    }
    expect(store.removePreference("introuvable")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("enforces MAX_PREFERENCES cap", () => {
    const store = createInMemoryProfileStore();
    const remaining = MAX_PREFERENCES - store.get().preferences.length;
    for (let i = 0; i < remaining; i += 1) {
      const res = store.addPreference(`Préférence ${i}`);
      expect(res.ok).toBe(true);
    }
    expect(store.addPreference("Une de trop")).toEqual({
      ok: false,
      reason: "limit-reached",
    });
  });

  it("appends declared notes without interpreting them and enforces bounds", () => {
    const store = createInMemoryProfileStore();
    const initialCount = store.get().declaredHistory.length;

    const res = store.addDeclaredNote("  Allergie saisonnière déclarée  ");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.memory.declaredHistory).toHaveLength(initialCount + 1);
      expect(res.memory.declaredHistory.at(-1)).toEqual({
        kind: "note",
        text: "Allergie saisonnière déclarée",
      });
    }

    expect(store.addDeclaredNote("   ")).toEqual({
      ok: false,
      reason: "invalid-input",
    });

    const remaining = MAX_DECLARED_HISTORY - store.get().declaredHistory.length;
    for (let i = 0; i < remaining; i += 1) {
      expect(store.addDeclaredNote(`Note ${i}`).ok).toBe(true);
    }
    expect(store.addDeclaredNote("Note de trop")).toEqual({
      ok: false,
      reason: "limit-reached",
    });
  });

  it("appends validated call records and enforces MAX_CALL_HISTORY", () => {
    const store = createInMemoryProfileStore();
    const res = store.addCallRecord({
      at: "2026-11-27",
      direction: "in",
      summary: "Demande de recherche de dermatologue secteur 1.",
    });
    expect(res.ok).toBe(true);

    expect(
      store.addCallRecord({
        at: "2026-02-30",
        direction: "in",
        summary: "Date invalide",
      }),
    ).toEqual({ ok: false, reason: "invalid-input" });

    expect(
      store.addCallRecord({
        at: "2026-11-27",
        direction: "out",
        summary: "   ",
      }),
    ).toEqual({ ok: false, reason: "invalid-input" });

    const remaining = MAX_CALL_HISTORY - store.get().callHistory.length;
    for (let i = 0; i < remaining; i += 1) {
      expect(
        store.addCallRecord({
          at: "2026-11-27",
          direction: "out",
          summary: `Appel ${i}`,
        }).ok,
      ).toBe(true);
    }
    expect(
      store.addCallRecord({
        at: "2026-11-27",
        direction: "out",
        summary: "Appel de trop",
      }),
    ).toEqual({ ok: false, reason: "limit-reached" });
  });

  it("resets back to the initial snapshot", () => {
    const store = createInMemoryProfileStore();
    const initial = store.get();
    store.addPreference("Nouvelle préférence");
    expect(store.get().preferences.length).toBe(initial.preferences.length + 1);

    const reset = store.reset();
    expect(reset).toEqual(initial);
  });
});
