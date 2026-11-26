export { createInbox } from "./inbox.ts";
export { InMemoryInboxStorage } from "./storage.ts";
export { inboxLimits } from "./contracts.ts";
export type { InMemoryInboxStorageOptions } from "./storage.ts";
export type {
  AppointmentConfirmationClassification,
  AppointmentConfirmationReceivedEvent,
  CreateInboxOptions,
  DocumentReceivedEvent,
  Inbox,
  InboxAttachment,
  InboxClock,
  InboxError,
  InboxEvent,
  InboxProvenance,
  InboxStorage,
  InboundMessageClassification,
  InboundMessageClassifier,
  IngestMessageResult,
  NormalizedInboundMessage,
  MailGateway,
  MailGatewayRequest,
  MailGatewayResponse,
  OutboundClaimResult,
  ProcessedInboundRecord,
  ReportClassification,
  UnsupportedClassification,
  SendDocumentError,
  SendDocumentRequest,
  SendDocumentResult,
  SentOutboundRecord,
} from "./contracts.ts";
