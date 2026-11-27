import { describe, expect, it } from "vitest";
import {
  InMemoryInboxStorage,
  ScriptedMailGateway,
  createInbox,
  inboxLimits,
  type MailGatewayRequest,
} from "./index.ts";

function attachment(bytes = new Uint8Array([1, 2, 3])) {
  return {
    id: "synthetic-document-1",
    fileName: "synthetic-document.pdf",
    mimeType: "application/pdf",
    bytes,
  };
}

function gatewayRequest(
  requestId = "delivery-request-1",
  bytes = new Uint8Array([1, 2, 3]),
): MailGatewayRequest {
  return {
    requestId,
    to: "practitioner@example.test",
    subject: "Synthetic document",
    textBody: "Synthetic test content only.",
    attachments: [attachment(bytes)],
  };
}

function sendRequest(requestId = "delivery-request-1", bytes = new Uint8Array([1, 2, 3])) {
  return {
    requestId,
    practitionerEmail: "practitioner@example.test",
    subject: "Synthetic document",
    textBody: "Synthetic test content only.",
    attachments: [attachment(bytes)],
    authorization: { authorized: true },
  };
}

const sentStep = {
  type: "sent",
  providerMessageId: "synthetic-provider-message-1",
  sentAt: "2026-11-27T12:00:00.000Z",
};

function gatewayWith(steps: readonly unknown[]) {
  return new ScriptedMailGateway([
    { requestId: "delivery-request-1", steps },
  ]);
}

function inboxWith(gateway: ScriptedMailGateway) {
  return createInbox({
    classifier: { classify: async () => ({ type: "unsupported" }) },
    mailGateway: gateway,
    storage: new InMemoryInboxStorage(),
  });
}

describe("ScriptedMailGateway", () => {
  it("returns sent, not-sent, and failure steps in strict order", async () => {
    const gateway = gatewayWith([sentStep, { type: "not-sent" }, { type: "failure" }]);
    await expect(gateway.send(gatewayRequest())).resolves.toEqual({
      status: "sent",
      providerMessageId: "synthetic-provider-message-1",
      sentAt: "2026-11-27T12:00:00.000Z",
    });
    await expect(gateway.send(gatewayRequest())).resolves.toEqual({ status: "not-sent" });
    await expect(gateway.send(gatewayRequest())).rejects.toThrow(
      "Scripted mail gateway failed.",
    );
    expect(gateway.getHistory()).toHaveLength(3);
  });

  it("returns not-sent for unknown and exhausted request identifiers", async () => {
    const gateway = gatewayWith([sentStep]);
    await expect(gateway.send(gatewayRequest("unknown-request"))).resolves.toEqual({
      status: "not-sent",
    });
    await expect(gateway.send(gatewayRequest())).resolves.toMatchObject({ status: "sent" });
    await expect(gateway.send(gatewayRequest())).resolves.toEqual({ status: "not-sent" });
  });

  it("keeps request scenarios independent", async () => {
    const gateway = new ScriptedMailGateway([
      { requestId: "delivery-request-1", steps: [sentStep] },
      { requestId: "delivery-request-2", steps: [{ type: "not-sent" }] },
    ]);
    await expect(gateway.send(gatewayRequest("delivery-request-2"))).resolves.toEqual({
      status: "not-sent",
    });
    await expect(gateway.send(gatewayRequest("delivery-request-1"))).resolves.toMatchObject({
      status: "sent",
    });
  });

  it("consumes distinct steps for simultaneous calls", async () => {
    const gateway = gatewayWith([sentStep, { type: "not-sent" }]);
    const results = await Promise.all([
      gateway.send(gatewayRequest()),
      gateway.send(gatewayRequest()),
    ]);
    expect(results).toEqual([
      {
        status: "sent",
        providerMessageId: "synthetic-provider-message-1",
        sentAt: "2026-11-27T12:00:00.000Z",
      },
      { status: "not-sent" },
    ]);
  });

  it("records requests before executing a failure", async () => {
    const gateway = gatewayWith([{ type: "failure" }]);
    await expect(gateway.send(gatewayRequest())).rejects.toThrow();
    expect(gateway.getHistory()).toHaveLength(1);
  });

  it("bounds history and removes its oldest entry", async () => {
    const gateway = new ScriptedMailGateway([], { historyLimit: 2 });
    await gateway.send(gatewayRequest("delivery-request-1"));
    await gateway.send(gatewayRequest("delivery-request-2"));
    await gateway.send(gatewayRequest("delivery-request-3"));
    expect(gateway.getHistory().map((entry) => entry.requestId)).toEqual([
      "delivery-request-2",
      "delivery-request-3",
    ]);
  });

  it("returns defensive history arrays, attachments, and bytes", async () => {
    const sourceBytes = new Uint8Array([7, 8, 9]);
    const gateway = new ScriptedMailGateway([]);
    const pending = gateway.send(gatewayRequest("delivery-request-1", sourceBytes));
    sourceBytes.fill(0);
    await pending;

    const firstHistory = gateway.getHistory();
    expect(firstHistory[0]?.attachments[0]?.bytes).toEqual(new Uint8Array([7, 8, 9]));
    firstHistory[0]?.attachments[0]?.bytes.fill(4);
    Reflect.deleteProperty(firstHistory, "0");

    const secondHistory = gateway.getHistory();
    expect(secondHistory).toHaveLength(1);
    expect(secondHistory[0]?.attachments[0]?.bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(secondHistory).not.toBe(firstHistory);
    expect(secondHistory[0]).not.toBe(firstHistory[0]);
  });

  it("copies scenario configuration at construction", async () => {
    const step = { ...sentStep };
    const steps = [step];
    const scenarios = [{ requestId: "delivery-request-1", steps }];
    const gateway = new ScriptedMailGateway(scenarios);
    step.providerMessageId = "changed-provider-message";
    steps.splice(0, 1, { type: "not-sent", providerMessageId: "ignored", sentAt: "ignored" });
    scenarios.splice(0, 1);

    await expect(gateway.send(gatewayRequest())).resolves.toEqual({
      status: "sent",
      providerMessageId: "synthetic-provider-message-1",
      sentAt: "2026-11-27T12:00:00.000Z",
    });
  });

  it.each([
    ["a non-array scenario list", { requestId: "delivery-request-1" }],
    ["an empty step sequence", [{ requestId: "delivery-request-1", steps: [] }]],
    ["an empty request id", [{ requestId: "", steps: [{ type: "not-sent" }] }]],
    ["an invalid request id", [{ requestId: "invalid id", steps: [{ type: "not-sent" }] }]],
    ["an oversized request id", [{
      requestId: "r".repeat(inboxLimits.outboundRequestIdCharacters + 1),
      steps: [{ type: "not-sent" }],
    }]],
    ["duplicate request ids", [
      { requestId: "delivery-request-1", steps: [{ type: "not-sent" }] },
      { requestId: "delivery-request-1", steps: [{ type: "not-sent" }] },
    ]],
    ["an unknown step", [{ requestId: "delivery-request-1", steps: [{ type: "unknown" }] }]],
    ["extra scenario fields", [{
      requestId: "delivery-request-1",
      steps: [{ type: "not-sent" }],
      address: "not allowed",
    }]],
    ["extra step fields", [{
      requestId: "delivery-request-1",
      steps: [{ type: "not-sent", reason: "not allowed" }],
    }]],
    ["an empty provider message id", [{
      requestId: "delivery-request-1",
      steps: [{ ...sentStep, providerMessageId: "" }],
    }]],
    ["an oversized provider message id", [{
      requestId: "delivery-request-1",
      steps: [{
        ...sentStep,
        providerMessageId: "p".repeat(inboxLimits.providerMessageIdCharacters + 1),
      }],
    }]],
    ["a sent timestamp without timezone", [{
      requestId: "delivery-request-1",
      steps: [{ ...sentStep, sentAt: "2026-11-27T12:00:00" }],
    }]],
    ["an invalid sent timestamp", [{
      requestId: "delivery-request-1",
      steps: [{ ...sentStep, sentAt: "not-a-date" }],
    }]],
  ])("rejects configuration with %s", (_label, scenarios) => {
    expect(() => new ScriptedMailGateway(scenarios)).toThrow(
      "Invalid scripted mail gateway configuration.",
    );
  });

  it("rejects too many scenarios and too many steps", () => {
    const scenarios = Array.from(
      { length: inboxLimits.scriptedMailGatewayScenarios + 1 },
      (_, index) => ({
        requestId: `delivery-request-${index}`,
        steps: [{ type: "not-sent" }],
      }),
    );
    const steps = Array.from(
      { length: inboxLimits.scriptedMailGatewayStepsPerScenario + 1 },
      () => ({ type: "not-sent" }),
    );
    expect(() => new ScriptedMailGateway(scenarios)).toThrow();
    expect(() => new ScriptedMailGateway([
      { requestId: "delivery-request-1", steps },
    ])).toThrow();
  });

  it.each([
    ["zero history", { historyLimit: 0 }],
    ["negative history", { historyLimit: -1 }],
    ["null history", { historyLimit: null }],
    ["fractional history", { historyLimit: 1.5 }],
    ["oversized history", {
      historyLimit: inboxLimits.scriptedMailGatewayHistoryEntries + 1,
    }],
    ["zero scenarios", { maximumScenarios: 0 }],
    ["oversized steps", {
      maximumStepsPerScenario: inboxLimits.scriptedMailGatewayStepsPerScenario + 1,
    }],
    ["unknown option", { historyLimit: 1, delay: 10 }],
  ])("rejects invalid limits: %s", (_label, options) => {
    expect(() => Reflect.construct(ScriptedMailGateway, [[], options])).toThrow(
      "Invalid scripted mail gateway configuration.",
    );
  });

  it("honors lower scenario and step limits", () => {
    expect(() => new ScriptedMailGateway([
      { requestId: "delivery-request-1", steps: [{ type: "not-sent" }] },
      { requestId: "delivery-request-2", steps: [{ type: "not-sent" }] },
    ], { maximumScenarios: 1 })).toThrow();
    expect(() => new ScriptedMailGateway([
      {
        requestId: "delivery-request-1",
        steps: [{ type: "not-sent" }, { type: "not-sent" }],
      },
    ], { maximumStepsPerScenario: 1 })).toThrow();
  });

  it("rejects invalid requests without history or sensitive error content", async () => {
    const gateway = new ScriptedMailGateway([]);
    const invalid = {
      ...gatewayRequest(),
      to: "private@example.test\r\nBcc:other@example.test",
      subject: "private subject",
      attachments: [{ ...attachment(), fileName: "private-file.pdf" }],
    };
    const error = await gateway.send(invalid).catch((reason: unknown) => reason);
    expect(error).toEqual(new Error("Invalid mail gateway request."));
    expect(String(error)).not.toContain("private");
    expect(String(error)).not.toContain("other@example.test");
    expect(gateway.getHistory()).toEqual([]);
  });
});

describe("ScriptedMailGateway with createInbox", () => {
  it("records a sent delivery and deduplicates without a second gateway call", async () => {
    const gateway = gatewayWith([sentStep]);
    const inbox = inboxWith(gateway);
    const first = await inbox.sendDocument(sendRequest());
    const duplicate = await inbox.sendDocument(sendRequest());
    expect(first).toEqual({
      status: "sent",
      providerMessageId: "synthetic-provider-message-1",
      sentAt: "2026-11-27T12:00:00.000Z",
      deduplicated: false,
      tracking: "recorded",
    });
    expect(duplicate).toEqual({ ...first, deduplicated: true });
    expect(gateway.getHistory()).toHaveLength(1);
  });

  it("maps not-sent to GATEWAY_REJECTED", async () => {
    const result = await inboxWith(gatewayWith([{ type: "not-sent" }]))
      .sendDocument(sendRequest());
    expect(result).toMatchObject({
      status: "not-sent",
      error: { code: "GATEWAY_REJECTED" },
    });
  });

  it("maps failure to DELIVERY_FAILURE without leaking gateway details", async () => {
    const result = await inboxWith(gatewayWith([{ type: "failure" }]))
      .sendDocument(sendRequest());
    expect(result).toEqual({
      status: "not-sent",
      error: {
        code: "DELIVERY_FAILURE",
        message: "The mail gateway could not complete the delivery.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("Scripted mail gateway failed");
  });

  it.each([
    ["not-sent", { type: "not-sent" }],
    ["failure", { type: "failure" }],
  ])("releases the reservation after %s and consumes the retry step", async (_label, firstStep) => {
    const gateway = gatewayWith([firstStep, sentStep]);
    const inbox = inboxWith(gateway);
    expect((await inbox.sendDocument(sendRequest())).status).toBe("not-sent");
    expect((await inbox.sendDocument(sendRequest())).status).toBe("sent");
    expect(gateway.getHistory()).toHaveLength(2);
  });

  it("maps unknown and exhausted scenarios to GATEWAY_REJECTED", async () => {
    const unknownGateway = gatewayWith([sentStep]);
    const exhaustedGateway = gatewayWith([{ type: "not-sent" }]);
    expect(await inboxWith(unknownGateway).sendDocument(sendRequest("unknown-request")))
      .toMatchObject({ status: "not-sent", error: { code: "GATEWAY_REJECTED" } });
    const exhaustedInbox = inboxWith(exhaustedGateway);
    await exhaustedInbox.sendDocument(sendRequest());
    expect(await exhaustedInbox.sendDocument(sendRequest())).toMatchObject({
      status: "not-sent",
      error: { code: "GATEWAY_REJECTED" },
    });
  });

  it("receives defensive attachment copies from Inbox", async () => {
    const inputBytes = new Uint8Array([7, 8, 9]);
    const gateway = gatewayWith([{ type: "not-sent" }]);
    const pending = inboxWith(gateway).sendDocument(sendRequest("delivery-request-1", inputBytes));
    inputBytes.fill(0);
    await pending;
    expect(gateway.getHistory()[0]?.attachments[0]?.bytes).toEqual(
      new Uint8Array([7, 8, 9]),
    );
  });
});
