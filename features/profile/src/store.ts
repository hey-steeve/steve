import { loadDemoPatientMemory } from "./demo-user.ts";
import type { CallRecord, DeclaredNote, PatientMemory } from "./memory.ts";

export const MAX_PREFERENCES = 64 as const;
export const MAX_DECLARED_HISTORY = 128 as const;
export const MAX_CALL_HISTORY = 128 as const;
export const MAX_ENTRY_TEXT_CHARS = 1000 as const;

export type ProfileMutationError = "invalid-input" | "duplicate" | "not-found" | "limit-reached";

export type ProfileMutationResult =
  | { readonly ok: true; readonly memory: PatientMemory }
  | { readonly ok: false; readonly reason: ProfileMutationError };

export type PatientMemoryStore = {
  readonly get: () => PatientMemory;
  readonly addPreference: (preference: string) => ProfileMutationResult;
  readonly removePreference: (preference: string) => ProfileMutationResult;
  readonly addDeclaredNote: (text: string) => ProfileMutationResult;
  readonly addCallRecord: (record: CallRecord) => ProfileMutationResult;
  readonly reset: () => PatientMemory;
};

function cloneMemory(memory: PatientMemory): PatientMemory {
  return {
    demo: memory.demo,
    asOf: memory.asOf,
    identity: {
      ...memory.identity,
      children: memory.identity.children.map((child) => ({ ...child })),
    },
    declaredHistory: memory.declaredHistory.map((entry) =>
      entry.kind === "note"
        ? { ...entry }
        : { ...entry, practitioner: { ...entry.practitioner } },
    ),
    preferences: [...memory.preferences],
    callHistory: memory.callHistory.map((call) => ({ ...call })),
  };
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ENTRY_TEXT_CHARS) {
    return null;
  }
  return trimmed;
}

function normalizeComparisonKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("fr-FR");
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function createInMemoryProfileStore(
  initial: PatientMemory = loadDemoPatientMemory(),
): PatientMemoryStore {
  const baseline = cloneMemory(initial);
  let current = cloneMemory(baseline);

  return {
    get(): PatientMemory {
      return cloneMemory(current);
    },

    addPreference(preference: string): ProfileMutationResult {
      const text = normalizeText(preference);
      if (text === null) {
        return { ok: false, reason: "invalid-input" };
      }

      const key = normalizeComparisonKey(text);
      if (current.preferences.some((item) => normalizeComparisonKey(item) === key)) {
        return { ok: false, reason: "duplicate" };
      }

      if (current.preferences.length >= MAX_PREFERENCES) {
        return { ok: false, reason: "limit-reached" };
      }

      current = {
        ...current,
        preferences: [...current.preferences, text],
      };
      return { ok: true, memory: cloneMemory(current) };
    },

    removePreference(preference: string): ProfileMutationResult {
      const text = normalizeText(preference);
      if (text === null) {
        return { ok: false, reason: "invalid-input" };
      }

      const key = normalizeComparisonKey(text);
      const next = current.preferences.filter((item) => normalizeComparisonKey(item) !== key);
      if (next.length === current.preferences.length) {
        return { ok: false, reason: "not-found" };
      }

      current = {
        ...current,
        preferences: next,
      };
      return { ok: true, memory: cloneMemory(current) };
    },

    addDeclaredNote(textInput: string): ProfileMutationResult {
      const text = normalizeText(textInput);
      if (text === null) {
        return { ok: false, reason: "invalid-input" };
      }

      if (current.declaredHistory.length >= MAX_DECLARED_HISTORY) {
        return { ok: false, reason: "limit-reached" };
      }

      const note: DeclaredNote = { kind: "note", text };
      current = {
        ...current,
        declaredHistory: [...current.declaredHistory, note],
      };
      return { ok: true, memory: cloneMemory(current) };
    },

    addCallRecord(record: CallRecord): ProfileMutationResult {
      const at = normalizeText(record.at);
      const summary = normalizeText(record.summary);
      if (
        at === null ||
        !isCalendarDate(at) ||
        summary === null ||
        (record.direction !== "in" && record.direction !== "out")
      ) {
        return { ok: false, reason: "invalid-input" };
      }

      if (current.callHistory.length >= MAX_CALL_HISTORY) {
        return { ok: false, reason: "limit-reached" };
      }

      const entry: CallRecord = {
        at,
        direction: record.direction,
        summary,
      };
      current = {
        ...current,
        callHistory: [...current.callHistory, entry],
      };
      return { ok: true, memory: cloneMemory(current) };
    },

    reset(): PatientMemory {
      current = cloneMemory(baseline);
      return cloneMemory(current);
    },
  };
}
