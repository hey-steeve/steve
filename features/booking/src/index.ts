const MAX_ATTEMPTS = 2;

export interface AppointmentWindow {
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface AppointmentRequest {
  readonly requestId: string;
  readonly requestedWindow: AppointmentWindow;
}

export interface PractitionerCandidate {
  readonly practitionerId: string;
  readonly displayName: string;
}

export interface ConfirmedSlot {
  readonly startsAt: string;
  readonly endsAt: string;
}

export type PracticeCallResponse =
  | {
      readonly kind: "confirmed";
      readonly confirmationId: string;
      readonly slot: ConfirmedSlot;
    }
  | { readonly kind: "refused" }
  | { readonly kind: "unavailable" };

export interface PracticeCallInput {
  readonly request: AppointmentRequest;
  readonly practitioner: PractitionerCandidate;
}

export interface PracticeCaller {
  callPractice(input: PracticeCallInput): Promise<PracticeCallResponse>;
}

export type BookingAttempt =
  | {
      readonly kind: "confirmed";
      readonly practitioner: PractitionerCandidate;
      readonly confirmationId: string;
      readonly slot: ConfirmedSlot;
    }
  | {
      readonly kind: "refused" | "unavailable" | "invalid-response" | "caller-error";
      readonly practitioner: PractitionerCandidate;
    };

export type BookingResult =
  | {
      readonly kind: "confirmed";
      readonly requestId: string;
      readonly practitioner: PractitionerCandidate;
      readonly confirmationId: string;
      readonly slot: ConfirmedSlot;
      readonly attempts: readonly BookingAttempt[];
    }
  | {
      readonly kind: "not-confirmed";
      readonly requestId: string;
      readonly reason: "no-candidates" | "attempts-exhausted";
      readonly attempts: readonly BookingAttempt[];
    };

export async function bookAppointment(
  request: AppointmentRequest,
  candidates: readonly PractitionerCandidate[],
  caller: PracticeCaller,
): Promise<BookingResult> {
  const requestSnapshot = copyValidRequest(request);
  const candidateSnapshots = candidates.slice(0, MAX_ATTEMPTS).map(copyValidCandidate);
  const attempts: BookingAttempt[] = [];

  if (candidateSnapshots.length === 0) {
    return {
      kind: "not-confirmed",
      requestId: requestSnapshot.requestId,
      reason: "no-candidates",
      attempts,
    };
  }

  for (const practitioner of candidateSnapshots) {
    let response: unknown;

    try {
      response = await caller.callPractice({
        request: copyRequest(requestSnapshot),
        practitioner: copyPractitioner(practitioner),
      });
    } catch {
      attempts.push({
        kind: "caller-error",
        practitioner: copyPractitioner(practitioner),
      });
      continue;
    }

    const attempt = toBookingAttempt(response, practitioner);
    attempts.push(attempt);

    if (attempt.kind === "confirmed") {
      return {
        kind: "confirmed",
        requestId: requestSnapshot.requestId,
        practitioner: copyPractitioner(attempt.practitioner),
        confirmationId: attempt.confirmationId,
        slot: copyWindow(attempt.slot),
        attempts: attempts.map(copyAttempt),
      };
    }
  }

  return {
    kind: "not-confirmed",
    requestId: requestSnapshot.requestId,
    reason: "attempts-exhausted",
    attempts: attempts.map(copyAttempt),
  };
}

function copyValidRequest(request: AppointmentRequest): AppointmentRequest {
  if (!isRecord(request) || !isNonEmptyString(request.requestId)) {
    throw new TypeError("Invalid appointment request");
  }

  if (!isValidWindow(request.requestedWindow)) {
    throw new TypeError("Invalid requested appointment window");
  }

  return {
    requestId: request.requestId,
    requestedWindow: copyWindow(request.requestedWindow),
  };
}

function copyValidCandidate(candidate: PractitionerCandidate): PractitionerCandidate {
  if (
    !isRecord(candidate) ||
    !isNonEmptyString(candidate.practitionerId) ||
    !isNonEmptyString(candidate.displayName)
  ) {
    throw new TypeError("Invalid practitioner candidate");
  }

  return copyPractitioner(candidate);
}

function toBookingAttempt(
  response: unknown,
  practitioner: PractitionerCandidate,
): BookingAttempt {
  if (!isRecord(response) || typeof response["kind"] !== "string") {
    return invalidResponseAttempt(practitioner);
  }

  if (response["kind"] === "refused" || response["kind"] === "unavailable") {
    return {
      kind: response["kind"],
      practitioner: copyPractitioner(practitioner),
    };
  }

  if (
    response["kind"] === "confirmed" &&
    isNonEmptyString(response["confirmationId"]) &&
    isValidWindow(response["slot"])
  ) {
    return {
      kind: "confirmed",
      practitioner: copyPractitioner(practitioner),
      confirmationId: response["confirmationId"],
      slot: copyWindow(response["slot"]),
    };
  }

  return invalidResponseAttempt(practitioner);
}

function invalidResponseAttempt(practitioner: PractitionerCandidate): BookingAttempt {
  return {
    kind: "invalid-response",
    practitioner: copyPractitioner(practitioner),
  };
}

function isValidWindow(value: unknown): value is AppointmentWindow {
  if (
    !isRecord(value) ||
    !isTimestampWithTimezone(value["startsAt"]) ||
    !isTimestampWithTimezone(value["endsAt"])
  ) {
    return false;
  }

  return Date.parse(value["startsAt"]) < Date.parse(value["endsAt"]);
}

function isTimestampWithTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyRequest(request: AppointmentRequest): AppointmentRequest {
  return {
    requestId: request.requestId,
    requestedWindow: copyWindow(request.requestedWindow),
  };
}

function copyPractitioner(practitioner: PractitionerCandidate): PractitionerCandidate {
  return {
    practitionerId: practitioner.practitionerId,
    displayName: practitioner.displayName,
  };
}

function copyWindow(window: AppointmentWindow): AppointmentWindow {
  return {
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}

function copyAttempt(attempt: BookingAttempt): BookingAttempt {
  if (attempt.kind === "confirmed") {
    return {
      kind: "confirmed",
      practitioner: copyPractitioner(attempt.practitioner),
      confirmationId: attempt.confirmationId,
      slot: copyWindow(attempt.slot),
    };
  }

  return {
    kind: attempt.kind,
    practitioner: copyPractitioner(attempt.practitioner),
  };
}
