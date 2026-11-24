export type TriageNoTriageReason =
  | "http"
  | "timeout"
  | "network"
  | "malformed"
  | "throw"
  | "missing-key";

export type TriageLogEntry = {
  readonly cause: "no-triage";
  readonly reason: TriageNoTriageReason;
};

const entries: TriageLogEntry[] = [];

export function recordTriageLog(entry: TriageLogEntry): void {
  entries.push(entry);
}

export function readTriageLog(): readonly TriageLogEntry[] {
  return entries;
}

export function resetTriageLog(): void {
  entries.length = 0;
}
