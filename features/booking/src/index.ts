import {
  copyPractitioner,
  copyRequest,
  copyValidCandidate,
  copyValidRequest,
  copyWindow,
  isNonEmptyString,
  isRecord,
  isValidWindow,
} from "./validation.ts";

const MAX_ATTEMPTS = 2;

export {
  MAX_SCRIPTED_HISTORY_ENTRIES,
  MAX_SCRIPTED_PRACTITIONERS,
  MAX_SCRIPTED_STEPS_PER_PRACTITIONER,
  ScriptedPracticeCaller,
  type ScriptedPracticeCallerOptions,
  type ScriptedPracticeScenario,
  type ScriptedPracticeStep,
} from "./scripted-practice-caller.ts";

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

    const attempt = toBookingAttempt(
      response,
      practitioner,
      requestSnapshot.requestedWindow,
    );
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

function toBookingAttempt(
  response: unknown,
  practitioner: PractitionerCandidate,
  requestedWindow: AppointmentWindow,
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
    isValidWindow(response["slot"]) &&
    isWindowWithin(requestedWindow, response["slot"])
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

function isWindowWithin(
  requestedWindow: AppointmentWindow,
  confirmedSlot: ConfirmedSlot,
): boolean {
  return (
    Date.parse(requestedWindow.startsAt) <= Date.parse(confirmedSlot.startsAt) &&
    Date.parse(confirmedSlot.endsAt) <= Date.parse(requestedWindow.endsAt)
  );
}

function invalidResponseAttempt(practitioner: PractitionerCandidate): BookingAttempt {
  return {
    kind: "invalid-response",
    practitioner: copyPractitioner(practitioner),
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
