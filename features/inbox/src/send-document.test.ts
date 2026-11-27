import { describe, expect, it, vi } from "vitest";
import {
  InMemoryInboxStorage,
  createInbox,
  inboxLimits,
  type MailGateway,
} from "./index.ts";

function outboundAttachment(bytes = new Uint8Array([4, 5, 6])) {
  return {
    id: "synthetic-document-1",
    fileName: "synthetic-report.pdf",
    mimeType: "application/pdf",
    bytes,
  };
}

function validSendRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: "delivery-request-1",
    practitionerEmail: "practitioner@example.test",
    subject: "Synthetic document",
    textBody: "This message contains synthetic test data only.",
    attachments: [outboundAttachment()],
    authorization: { authorized: true },
    ...overrides,
  };
}

function outboundInbox(gateway: MailGateway, storage = new InMemoryInboxStorage()) {
  return createInbox({
    classifier: { classify: async () => ({ type: "unsupported" }) },
    mailGateway: gateway,
    storage,
  });
}

const sentResponse = {
  status: "sent",
  providerMessageId: "gateway-message-1",
  sentAt: "2026-11-27T11:00:00.000Z",
};

describe("authorized document delivery", () => {
  it("sends a defensively copied synthetic document through the gateway", async () => {
    const inputBytes = new Uint8Array([4, 5, 6]);
    const request = validSendRequest({ attachments: [outboundAttachment(inputBytes)] });
    const send = vi.fn(async (gatewayRequest) => {
      gatewayRequest.attachments[0]?.bytes.fill(0);
      return sentResponse;
    });

    const result = await outboundInbox({ send }).sendDocument(request);

    expect(result).toEqual({
      status: "sent",
      providerMessageId: "gateway-message-1",
      sentAt: "2026-11-27T11:00:00.000Z",
      deduplicated: false,
      tracking: "recorded",
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      requestId: "delivery-request-1",
      to: "practitioner@example.test",
      subject: "Synthetic document",
    });
    expect(inputBytes).toEqual(new Uint8Array([4, 5, 6]));
    expect(request).toMatchObject({ practitionerEmail: "practitioner@example.test" });
  });

  it("requires the explicit orchestrator authorization signal", async () => {
    const send = vi.fn(async () => sentResponse);
    const missing = await outboundInbox({ send }).sendDocument(
      validSendRequest({ authorization: undefined }),
    );
    const denied = await outboundInbox({ send }).sendDocument(
      validSendRequest({ authorization: { authorized: false } }),
    );
    expect(missing).toMatchObject({ status: "not-sent", error: { code: "NOT_AUTHORIZED" } });
    expect(denied).toMatchObject({ status: "not-sent", error: { code: "NOT_AUTHORIZED" } });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid recipient", { practitionerEmail: "not-an-email" }],
    [
      "recipient header injection",
      { practitionerEmail: "safe@example.test\r\nBcc:other@example.test" },
    ],
    ["subject header injection", { subject: "Document\nBcc: other@example.test" }],
    ["missing attachment", { attachments: [] }],
    ["empty attachment", { attachments: [outboundAttachment(new Uint8Array())] }],
    [
      "oversized attachment",
      { attachments: [outboundAttachment(new Uint8Array(inboxLimits.attachmentBytes + 1))] },
    ],
    [
      "path-like attachment",
      { attachments: [{ ...outboundAttachment(), fileName: "../synthetic.pdf" }] },
    ],
  ])("rejects %s without calling the gateway", async (_label, overrides) => {
    const send = vi.fn(async () => sentResponse);
    const result = await outboundInbox({ send }).sendDocument(validSendRequest(overrides));
    expect(result).toMatchObject({
      status: "not-sent",
      error: { code: "INVALID_SEND_REQUEST" },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("accepts an explicit valid not-sent response without claiming success", async () => {
    const result = await outboundInbox({
      send: async () => ({ status: "not-sent" }),
    }).sendDocument(validSendRequest());
    expect(result).toMatchObject({ status: "not-sent", error: { code: "GATEWAY_REJECTED" } });
  });

  it.each([
    ["ambiguous response", { status: "sent", notSent: true }],
    ["missing provider id", { status: "sent", sentAt: "2026-11-27T11:00:00.000Z" }],
    [
      "invalid sent date",
      { status: "sent", providerMessageId: "gateway-message-1", sentAt: "not-a-date" },
    ],
  ])("rejects an %s", async (_label, response) => {
    const result = await outboundInbox({ send: async () => response }).sendDocument(
      validSendRequest(),
    );
    expect(result).toMatchObject({
      status: "not-sent",
      error: { code: "INVALID_GATEWAY_RESPONSE" },
    });
  });

  it("contains gateway exceptions and does not expose provider details", async () => {
    const result = await outboundInbox({
      send: async () => {
        throw new Error("provider secret and endpoint");
      },
    }).sendDocument(validSendRequest());
    expect(result).toEqual({
      status: "not-sent",
      error: {
        code: "DELIVERY_FAILURE",
        message: "The mail gateway could not complete the delivery.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });

  it("deduplicates a stable outbound request without a second gateway call", async () => {
    const send = vi.fn(async () => sentResponse);
    const inbox = outboundInbox({ send });
    const first = await inbox.sendDocument(validSendRequest());
    const duplicate = await inbox.sendDocument(validSendRequest());
    expect(first).toMatchObject({ status: "sent", deduplicated: false });
    expect(duplicate).toEqual({
      status: "sent",
      providerMessageId: "gateway-message-1",
      sentAt: "2026-11-27T11:00:00.000Z",
      deduplicated: true,
      tracking: "recorded",
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("prevents two concurrent calls from invoking the gateway twice", async () => {
    let finish: (() => void) | undefined;
    const blocker = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const send = vi.fn(async () => {
      await blocker;
      return sentResponse;
    });
    const inbox = outboundInbox({ send });
    const firstPromise = inbox.sendDocument(validSendRequest());
    const second = await inbox.sendDocument(validSendRequest());
    finish?.();
    const first = await firstPromise;
    expect(first.status).toBe("sent");
    expect(second).toMatchObject({
      status: "not-sent",
      error: { code: "REQUEST_IN_PROGRESS" },
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("bounds tracked outbound requests", async () => {
    const storage = new InMemoryInboxStorage({ maximumOutboundRequests: 1 });
    expect(await storage.claimOutbound("request-1")).toEqual({ status: "claimed" });
    await expect(storage.claimOutbound("request-2")).rejects.toThrow("capacity");
    await storage.releaseOutbound("request-1");
    expect(await storage.claimOutbound("request-2")).toEqual({ status: "claimed" });
  });
});
