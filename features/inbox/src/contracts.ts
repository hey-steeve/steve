export const inboxLimits = {
  providerMessageIdCharacters: 200,
  emailAddressCharacters: 254,
  subjectCharacters: 998,
  textBodyCharacters: 100_000,
  attachmentCount: 10,
  attachmentIdCharacters: 200,
  attachmentFileNameCharacters: 255,
  attachmentMimeTypeCharacters: 100,
  attachmentBytes: 1_048_576,
  totalAttachmentBytes: 5_242_880,
  confirmationReferenceCharacters: 200,
  practitionerNameCharacters: 200,
  trackedInboundMessages: 1_000,
} as const;

export interface InboxAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface NormalizedInboundMessage {
  readonly providerMessageId: string;
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly textBody?: string;
  readonly attachments: readonly InboxAttachment[];
  readonly receivedAt: string;
}

export interface AppointmentConfirmationClassification {
  readonly type: "appointment-confirmation";
  readonly reference: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly practitionerName?: string;
}

export interface ReportClassification {
  readonly type: "report";
  readonly attachmentIds: readonly string[];
}

export interface UnsupportedClassification {
  readonly type: "unsupported";
}

export type InboundMessageClassification =
  | AppointmentConfirmationClassification
  | ReportClassification
  | UnsupportedClassification;

export interface InboundMessageClassifier {
  classify(message: NormalizedInboundMessage): Promise<unknown>;
}

export interface InboxProvenance {
  readonly providerMessageId: string;
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly receivedAt: string;
}

export interface AppointmentConfirmationReceivedEvent {
  readonly type: "appointment-confirmation-received";
  readonly provenance: InboxProvenance;
  readonly confirmation: {
    readonly reference: string;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly practitionerName?: string;
  };
  readonly requiresOwnerValidation: true;
}

export interface DocumentReceivedEvent {
  readonly type: "document-received";
  readonly provenance: InboxProvenance;
  readonly document: InboxAttachment;
  readonly verification: "unverified";
}

export type InboxEvent =
  | AppointmentConfirmationReceivedEvent
  | DocumentReceivedEvent;

export type IngestMessageResult =
  | { readonly status: "processed"; readonly events: readonly InboxEvent[] }
  | {
      readonly status: "unsupported";
      readonly reason: "message-unsupported" | "invalid-classifier-output";
      readonly provenance: InboxProvenance;
    }
  | { readonly status: "duplicate" }
  | {
      readonly status: "failed";
      readonly error: InboxError;
    };

export interface InboxError {
  readonly code:
    | "INVALID_MESSAGE"
    | "CLASSIFICATION_FAILURE"
    | "STORAGE_FAILURE";
  readonly message: string;
}

export interface ProcessedInboundRecord {
  readonly providerMessageId: string;
  readonly processedAt: string;
}

export interface InboxStorage {
  getInbound(providerMessageId: string): Promise<ProcessedInboundRecord | undefined>;
  createInbound(record: ProcessedInboundRecord): Promise<"created" | "duplicate">;
}

export interface InboxClock {
  now(): string;
}

export interface CreateInboxOptions {
  readonly classifier: InboundMessageClassifier;
  readonly storage: InboxStorage;
  readonly clock?: InboxClock;
}

export interface Inbox {
  ingestMessage(message: unknown): Promise<IngestMessageResult>;
}
