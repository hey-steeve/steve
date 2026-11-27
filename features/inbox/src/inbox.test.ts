import { describe, expect, it, vi } from "vitest";
import {
  InMemoryInboxStorage,
  createInbox,
  inboxLimits,
  type InboxStorage,
  type InboundMessageClassifier,
  type NormalizedInboundMessage,
} from "./index.ts";

function validMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providerMessageId: "provider-message-1",
    from: "practice@example.test",
    to: "user@steve.example",
    subject: "Synthetic appointment confirmation",
    textBody: "This is synthetic test content.",
    attachments: [],
    receivedAt: "2026-11-27T09:00:00+01:00",
    ...overrides,
  };
}

function attachment(id = "attachment-1", bytes = new Uint8Array([1, 2, 3])) {
  return {
    id,
    fileName: `${id}.pdf`,
    mimeType: "application/pdf",
    bytes,
  };
}

function inboxWith(classify: InboundMessageClassifier["classify"], storage?: InboxStorage) {
  return createInbox({
    classifier: { classify },
    mailGateway: { send: async () => ({ status: "not-sent" }) },
    storage: storage ?? new InMemoryInboxStorage(),
    clock: { now: () => "2026-11-27T10:00:00.000Z" },
  });
}

describe("inbound Inbox lifecycle", () => {
  it("returns an explicit appointment confirmation for owner validation", async () => {
    const result = await inboxWith(async () => ({
      type: "appointment-confirmation",
      reference: "synthetic-ref-1",
      startsAt: "2026-12-01T09:00:00+01:00",
      endsAt: "2026-12-01T09:30:00+01:00",
      practitionerName: "Dr Synthetic",
    })).ingestMessage(validMessage());

    expect(result).toEqual({
      status: "processed",
      events: [
        {
          type: "appointment-confirmation-received",
          provenance: {
            providerMessageId: "provider-message-1",
            from: "practice@example.test",
            to: "user@steve.example",
            subject: "Synthetic appointment confirmation",
            receivedAt: "2026-11-27T09:00:00+01:00",
          },
          confirmation: {
            reference: "synthetic-ref-1",
            startsAt: "2026-12-01T09:00:00+01:00",
            endsAt: "2026-12-01T09:30:00+01:00",
            practitionerName: "Dr Synthetic",
          },
          requiresOwnerValidation: true,
        },
      ],
    });
  });

  it("returns unverified document events only for attachments named by a report", async () => {
    const result = await inboxWith(async () => ({
      type: "report",
      attachmentIds: ["attachment-1"],
    })).ingestMessage(validMessage({ attachments: [attachment()] }));

    expect(result.status).toBe("processed");
    if (result.status === "processed") {
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        type: "document-received",
        verification: "unverified",
      });
      expect(result.events.map((event) => event.type)).not.toContain("agenda");
      expect(result.events.map((event) => event.type)).not.toContain("vault");
      expect(result.events.map((event) => event.type)).not.toContain("reminder");
    }
  });

  it("stores explicit unsupported and invalid classifier outcomes as unsupported", async () => {
    const explicit = await inboxWith(async () => ({ type: "unsupported" })).ingestMessage(
      validMessage(),
    );
    const ambiguous = await inboxWith(async () => ({
      type: "unsupported",
      attachmentIds: ["attachment-1"],
    })).ingestMessage(validMessage());
    const invalid = await inboxWith(async () => ({ type: "report", attachmentIds: "not-an-array" }))
      .ingestMessage(validMessage());

    expect(explicit).toMatchObject({ status: "unsupported", reason: "message-unsupported" });
    expect(ambiguous).toMatchObject({
      status: "unsupported",
      reason: "invalid-classifier-output",
    });
    expect(invalid).toMatchObject({
      status: "unsupported",
      reason: "invalid-classifier-output",
    });
  });

  it("contains classifier exceptions without persisting and permits a retry", async () => {
    let attempts = 0;
    const inbox = inboxWith(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("sensitive classifier detail");
      }
      return { type: "unsupported" };
    });

    const first = await inbox.ingestMessage(validMessage());
    const retry = await inbox.ingestMessage(validMessage());

    expect(first).toEqual({
      status: "failed",
      error: {
        code: "CLASSIFICATION_FAILURE",
        message: "The inbound message could not be classified.",
      },
    });
    expect(JSON.stringify(first)).not.toContain("sensitive classifier detail");
    expect(retry.status).toBe("unsupported");
    expect(attempts).toBe(2);
  });

  it("does not classify an already processed provider message twice", async () => {
    const classify = vi.fn(async () => ({ type: "unsupported" }));
    const inbox = inboxWith(classify);

    expect((await inbox.ingestMessage(validMessage())).status).toBe("unsupported");
    expect((await inbox.ingestMessage(validMessage())).status).toBe("duplicate");
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("lets only one concurrent ingestion publish events", async () => {
    const inbox = inboxWith(async () => ({ type: "unsupported" }));
    const results = await Promise.all([
      inbox.ingestMessage(validMessage()),
      inbox.ingestMessage(validMessage()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["duplicate", "unsupported"]);
  });

  it("contains storage exceptions", async () => {
    const storage: InboxStorage = {
      getInbound: async () => {
        throw new Error("database connection string");
      },
      createInbound: async () => "created",
      claimOutbound: async () => ({ status: "claimed" }),
      completeOutbound: async () => undefined,
      releaseOutbound: async () => undefined,
    };
    const result = await inboxWith(async () => ({ type: "unsupported" }), storage).ingestMessage(
      validMessage(),
    );
    expect(result).toEqual({
      status: "failed",
      error: { code: "STORAGE_FAILURE", message: "Inbox storage is unavailable." },
    });
    expect(JSON.stringify(result)).not.toContain("database connection string");
  });

  it.each([
    ["empty provider id", { providerMessageId: "" }],
    ["malformed provider id", { providerMessageId: "bad id" }],
    ["invalid sender", { from: "not-an-email" }],
    ["sender header injection", { from: "safe@example.test\r\nBcc:x@example.test" }],
    ["recipient header injection", { to: "safe@example.test\nBcc:x@example.test" }],
    ["subject header injection", { subject: "hello\r\nBcc: x@example.test" }],
    ["oversized subject", { subject: "s".repeat(inboxLimits.subjectCharacters + 1) }],
    ["oversized body", { textBody: "b".repeat(inboxLimits.textBodyCharacters + 1) }],
    [
      "too many attachments",
      {
        attachments: Array.from({ length: inboxLimits.attachmentCount + 1 }, (_, index) =>
          attachment(`attachment-${index}`),
        ),
      },
    ],
    ["empty attachment", { attachments: [attachment("empty", new Uint8Array())] }],
    [
      "oversized attachment",
      {
        attachments: [
          attachment("large", new Uint8Array(inboxLimits.attachmentBytes + 1)),
        ],
      },
    ],
    [
      "oversized attachment total",
      {
        attachments: Array.from({ length: 6 }, (_, index) =>
          attachment(`large-${index}`, new Uint8Array(inboxLimits.attachmentBytes)),
        ),
      },
    ],
    [
      "path-like file name",
      { attachments: [{ ...attachment(), fileName: "../synthetic.pdf" }] },
    ],
  ])("rejects %s", async (_label, overrides) => {
    const classify = vi.fn(async () => ({ type: "unsupported" }));
    const result = await inboxWith(classify).ingestMessage(validMessage(overrides));
    expect(result).toMatchObject({ status: "failed", error: { code: "INVALID_MESSAGE" } });
    expect(classify).not.toHaveBeenCalled();
  });

  it.each([
    ["missing report attachment", { type: "report", attachmentIds: ["absent"] }],
    [
      "empty confirmation reference",
      {
        type: "appointment-confirmation",
        reference: "",
        startsAt: "2026-12-01T09:00:00+01:00",
        endsAt: "2026-12-01T09:30:00+01:00",
      },
    ],
    [
      "confirmation without timezone",
      {
        type: "appointment-confirmation",
        reference: "synthetic-ref",
        startsAt: "2026-12-01T09:00:00",
        endsAt: "2026-12-01T09:30:00",
      },
    ],
    [
      "confirmation with reversed dates",
      {
        type: "appointment-confirmation",
        reference: "synthetic-ref",
        startsAt: "2026-12-01T10:00:00+01:00",
        endsAt: "2026-12-01T09:30:00+01:00",
      },
    ],
    [
      "confirmation with an impossible calendar date",
      {
        type: "appointment-confirmation",
        reference: "synthetic-ref",
        startsAt: "2026-02-30T09:00:00+01:00",
        endsAt: "2026-02-30T09:30:00+01:00",
      },
    ],
  ])("treats %s as invalid classifier output", async (_label, classification) => {
    const result = await inboxWith(async () => classification).ingestMessage(
      validMessage({ attachments: [attachment()] }),
    );
    expect(result).toMatchObject({
      status: "unsupported",
      reason: "invalid-classifier-output",
    });
  });

  it("defensively copies input, classifier snapshots, stored records, and returned bytes", async () => {
    const inputBytes = new Uint8Array([7, 8, 9]);
    const input = validMessage({ attachments: [attachment("attachment-1", inputBytes)] });
    const storage = new InMemoryInboxStorage();
    const classifier: InboundMessageClassifier = {
      async classify(message: NormalizedInboundMessage) {
        message.attachments[0]?.bytes.fill(0);
        return { type: "report", attachmentIds: ["attachment-1"] };
      },
    };
    const inbox = createInbox({
      classifier,
      mailGateway: { send: async () => ({ status: "not-sent" }) },
      storage,
      clock: { now: () => "2026-11-27T10:00:00.000Z" },
    });

    const result = await inbox.ingestMessage(input);
    expect(inputBytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(input).toMatchObject({ providerMessageId: "provider-message-1" });
    if (result.status === "processed" && result.events[0]?.type === "document-received") {
      expect(result.events[0].document.bytes).toEqual(new Uint8Array([7, 8, 9]));
    } else {
      expect.unreachable("Expected a document event");
    }

    const record = await storage.getInbound("provider-message-1");
    expect(record).toEqual({
      providerMessageId: "provider-message-1",
      processedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("bounds in-memory storage and never replaces an existing record", async () => {
    const storage = new InMemoryInboxStorage({ maximumInboundMessages: 1 });
    const original = {
      providerMessageId: "provider-message-1",
      processedAt: "2026-11-27T10:00:00.000Z",
    };
    expect(await storage.createInbound(original)).toBe("created");
    expect(
      await storage.createInbound({ ...original, processedAt: "2026-11-27T11:00:00.000Z" }),
    ).toBe("duplicate");
    await expect(
      storage.createInbound({
        providerMessageId: "provider-message-2",
        processedAt: "2026-11-27T10:00:00.000Z",
      }),
    ).rejects.toThrow("capacity");
    expect(await storage.getInbound("provider-message-1")).toEqual(original);
  });
});
