import {
  inboxLimits,
  type InboxStorage,
  type ProcessedInboundRecord,
} from "./contracts.ts";

export interface InMemoryInboxStorageOptions {
  readonly maximumInboundMessages?: number;
}

function copyRecord(record: ProcessedInboundRecord): ProcessedInboundRecord {
  return {
    providerMessageId: record.providerMessageId,
    processedAt: record.processedAt,
  };
}

export class InMemoryInboxStorage implements InboxStorage {
  readonly #inbound = new Map<string, ProcessedInboundRecord>();
  readonly #maximumInboundMessages: number;

  constructor(options: InMemoryInboxStorageOptions = {}) {
    const maximum = options.maximumInboundMessages ?? inboxLimits.trackedInboundMessages;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > inboxLimits.trackedInboundMessages) {
      throw new Error("Invalid in-memory Inbox capacity.");
    }
    this.#maximumInboundMessages = maximum;
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
}
