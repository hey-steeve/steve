import type {
  AppointmentRequest,
  AppointmentWindow,
  PractitionerCandidate,
} from "./index.ts";

export function copyValidRequest(request: AppointmentRequest): AppointmentRequest {
  if (!isRecord(request) || !isNonEmptyString(request.requestId)) {
    throw new TypeError("Invalid appointment request");
  }

  if (!isValidWindow(request.requestedWindow)) {
    throw new TypeError("Invalid requested appointment window");
  }

  return copyRequest(request);
}

export function copyValidCandidate(
  candidate: PractitionerCandidate,
): PractitionerCandidate {
  if (
    !isRecord(candidate) ||
    !isNonEmptyString(candidate.practitionerId) ||
    !isNonEmptyString(candidate.displayName)
  ) {
    throw new TypeError("Invalid practitioner candidate");
  }

  return copyPractitioner(candidate);
}

export function isValidWindow(value: unknown): value is AppointmentWindow {
  if (
    !isRecord(value) ||
    !isTimestampWithTimezone(value["startsAt"]) ||
    !isTimestampWithTimezone(value["endsAt"])
  ) {
    return false;
  }

  return Date.parse(value["startsAt"]) < Date.parse(value["endsAt"]);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function copyRequest(request: AppointmentRequest): AppointmentRequest {
  return {
    requestId: request.requestId,
    requestedWindow: copyWindow(request.requestedWindow),
  };
}

export function copyPractitioner(
  practitioner: PractitionerCandidate,
): PractitionerCandidate {
  return {
    practitionerId: practitioner.practitionerId,
    displayName: practitioner.displayName,
  };
}

export function copyWindow(window: AppointmentWindow): AppointmentWindow {
  return {
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}

function isTimestampWithTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
