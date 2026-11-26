import {
  type AppointmentConfirmationReceivedEvent,
  type CreateInboxOptions,
  type DocumentReceivedEvent,
  type Inbox,
  type InboxClock,
  type InboxError,
  type InboxEvent,
  type IngestMessageResult,
  type NormalizedInboundMessage,
  type ReportClassification,
} from "./contracts.ts";
import {
  copyMessage,
  parseClassification,
  parseNormalizedMessage,
  provenanceOf,
} from "./validation.ts";

const systemClock: InboxClock = {
  now: () => new Date().toISOString(),
};

const errors: Readonly<Record<InboxError["code"], InboxError>> = {
  INVALID_MESSAGE: {
    code: "INVALID_MESSAGE",
    message: "The normalized inbound message is invalid.",
  },
  CLASSIFICATION_FAILURE: {
    code: "CLASSIFICATION_FAILURE",
    message: "The inbound message could not be classified.",
  },
  STORAGE_FAILURE: {
    code: "STORAGE_FAILURE",
    message: "Inbox storage is unavailable.",
  },
};

function failed(code: InboxError["code"]): IngestMessageResult {
  return { status: "failed", error: errors[code] };
}

function appointmentEvent(
  message: NormalizedInboundMessage,
  classification: {
    readonly reference: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly practitionerName?: string;
  },
): AppointmentConfirmationReceivedEvent {
  const confirmation = {
    reference: classification.reference,
    startsAt: classification.startsAt,
    endsAt: classification.endsAt,
  };
  return {
    type: "appointment-confirmation-received",
    provenance: provenanceOf(message),
    confirmation:
      classification.practitionerName === undefined
        ? confirmation
        : { ...confirmation, practitionerName: classification.practitionerName },
    requiresOwnerValidation: true,
  };
}

function reportEvents(
  message: NormalizedInboundMessage,
  classification: ReportClassification,
): readonly DocumentReceivedEvent[] {
  const requestedIds = new Set(classification.attachmentIds);
  return message.attachments
    .filter((attachment) => requestedIds.has(attachment.id))
    .map((attachment) => ({
      type: "document-received",
      provenance: provenanceOf(message),
      document: { ...attachment, bytes: new Uint8Array(attachment.bytes) },
      verification: "unverified",
    }));
}

function eventsFor(
  message: NormalizedInboundMessage,
  classification: Exclude<
    ReturnType<typeof parseClassification>,
    undefined | { readonly type: "unsupported" }
  >,
): readonly InboxEvent[] {
  if (classification.type === "appointment-confirmation") {
    return [appointmentEvent(message, classification)];
  }
  return reportEvents(message, classification);
}

export function createInbox(options: CreateInboxOptions): Inbox {
  const clock = options.clock ?? systemClock;

  return {
    async ingestMessage(input: unknown): Promise<IngestMessageResult> {
      let message: NormalizedInboundMessage | undefined;
      try {
        message = parseNormalizedMessage(input);
      } catch {
        return failed("INVALID_MESSAGE");
      }
      if (message === undefined) {
        return failed("INVALID_MESSAGE");
      }

      try {
        if ((await options.storage.getInbound(message.providerMessageId)) !== undefined) {
          return { status: "duplicate" };
        }
      } catch {
        return failed("STORAGE_FAILURE");
      }

      let rawClassification: unknown;
      try {
        rawClassification = await options.classifier.classify(copyMessage(message));
      } catch {
        return failed("CLASSIFICATION_FAILURE");
      }

      let classification: ReturnType<typeof parseClassification>;
      try {
        classification = parseClassification(rawClassification, message);
      } catch {
        classification = undefined;
      }

      const unsupportedReason =
        classification === undefined
          ? "invalid-classifier-output"
          : classification.type === "unsupported"
            ? "message-unsupported"
            : undefined;
      const events =
        classification === undefined || classification.type === "unsupported"
          ? undefined
          : eventsFor(message, classification);

      let processedAt: string;
      try {
        processedAt = clock.now();
        if (!Number.isFinite(Date.parse(processedAt))) {
          return failed("STORAGE_FAILURE");
        }
        const outcome = await options.storage.createInbound({
          providerMessageId: message.providerMessageId,
          processedAt,
        });
        if (outcome === "duplicate") {
          return { status: "duplicate" };
        }
      } catch {
        return failed("STORAGE_FAILURE");
      }

      if (unsupportedReason !== undefined) {
        return {
          status: "unsupported",
          reason: unsupportedReason,
          provenance: provenanceOf(message),
        };
      }
      return { status: "processed", events: events ?? [] };
    },
  };
}
