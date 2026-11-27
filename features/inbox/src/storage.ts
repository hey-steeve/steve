import {
  inboxLimits,
  type InboxStorage,
  type OutboundClaimResult,
  type ProcessedInboundRecord,
  type SentOutboundRecord,
} from "./contracts.ts";

export interface InMemoryInboxStorageOptions {
  readonly maximumInboundMessages?: number;
  readonly maximumOutboundRequests?: number;
}

type OutboundRecord =
  | { readonly status: "pending" }
  | { readonly status: "sent"; readonly record: SentOutboundRecord };

function copyOutboundRecord(record: SentOutboundRecord): SentOutboundRecord {
  return {
    requestId: record.requestId,
    providerMessageId: record.providerMessageId,
    sentAt: record.sentAt,
  };
}

function copyRecord(record: ProcessedInboundRecord): ProcessedInboundRecord {
  return {
    providerMessageId: record.providerMessageId,
    processedAt: record.processedAt,
  };
}

export class InMemoryInboxStorage implements InboxStorage {
  readonly #inbound = new Map<string, ProcessedInboundRecord>();
  readonly #outbound = new Map<string, OutboundRecord>();
  readonly #maximumInboundMessages: number;
  readonly #maximumOutboundRequests: number;

  constructor(options: InMemoryInboxStorageOptions = {}) {
    const maximum = options.maximumInboundMessages ?? inboxLimits.trackedInboundMessages;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > inboxLimits.trackedInboundMessages) {
      throw new Error("Invalid in-memory Inbox capacity.");
    }
    this.#maximumInboundMessages = maximum;
    const maximumOutbound =
      options.maximumOutboundRequests ?? inboxLimits.trackedOutboundRequests;
    if (
      !Number.isSafeInteger(maximumOutbound) ||
      maximumOutbound < 1 ||
      maximumOutbound > inboxLimits.trackedOutboundRequests
    ) {
      throw new Error("Invalid in-memory Inbox outbound capacity.");
    }
    this.#maximumOutboundRequests = maximumOutbound;
  }

  async getInbound(providerMessageId: string): Promise<ProcessedInboundRecord | undefined> {
    const record = this.#inbound.get(providerMessageId);
    return record === undefined ? undefined : copyRecord(record);
  }

  async createInbound(record: ProcessedInboundRecord): Promise<"created" | "duplicate"> {
    if (this.#inbound.has(record.providerMessageId)) {
      return "duplicate";
    }
    if (this.#inbound.size >= this.#maximumInboundMessages) {
      throw new Error("In-memory Inbox capacity reached.");
    }
    this.#inbound.set(record.providerMessageId, copyRecord(record));
    return "created";
  }

  async claimOutbound(requestId: string): Promise<OutboundClaimResult> {
    const existing = this.#outbound.get(requestId);
    if (existing?.status === "pending") {
      return { status: "in-progress" };
    }
    if (existing?.status === "sent") {
      return { status: "duplicate", record: copyOutboundRecord(existing.record) };
    }
    if (this.#outbound.size >= this.#maximumOutboundRequests) {
      throw new Error("In-memory Inbox outbound capacity reached.");
    }
    this.#outbound.set(requestId, { status: "pending" });
    return { status: "claimed" };
  }

  async completeOutbound(record: SentOutboundRecord): Promise<void> {
    if (this.#outbound.get(record.requestId)?.status !== "pending") {
      throw new Error("Outbound request is not pending.");
    }
    this.#outbound.set(record.requestId, {
      status: "sent",
      record: copyOutboundRecord(record),
    });
  }

  async releaseOutbound(requestId: string): Promise<void> {
    if (this.#outbound.get(requestId)?.status === "pending") {
      this.#outbound.delete(requestId);
    }
  }
}
