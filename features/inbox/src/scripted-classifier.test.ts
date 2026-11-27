import { describe, expect, it, vi } from "vitest";
import {
  InMemoryInboxStorage,
  ScriptedInboundMessageClassifier,
  createInbox,
  inboxLimits,
  type NormalizedInboundMessage,
} from "./index.ts";

function attachment(id: string, bytes = new Uint8Array([1, 2, 3])) {
  return {
    id,
    fileName: `${id}.pdf`,
    mimeType: "application/pdf",
    bytes,
  };
}

function message(
  providerMessageId = "provider-message-1",
  attachments: readonly ReturnType<typeof attachment>[] = [],
): NormalizedInboundMessage {
  return {
    providerMessageId,
    from: "practice@example.test",
    to: "user@steve.example",
    subject: "Synthetic message",
    textBody: "Synthetic test content.",
    attachments,
    receivedAt: "2026-11-27T09:00:00+01:00",
  };
}

const confirmation = {
  type: "appointment-confirmation",
  reference: "synthetic-reference-1",
  startsAt: "2026-12-02T09:00:00+01:00",
  endsAt: "2026-12-02T09:30:00+01:00",
  practitionerName: "Dr Synthetic",
};

function classifierWith(steps: readonly unknown[]) {
  return new ScriptedInboundMessageClassifier([
    { providerMessageId: "provider-message-1", steps },
  ]);
}

function integrationInbox(classifier: ScriptedInboundMessageClassifier) {
  const send = vi.fn(async () => ({ status: "not-sent" }));
  return {
    inbox: createInbox({
      classifier,
      mailGateway: { send },
      storage: new InMemoryInboxStorage(),
      clock: { now: () => "2026-11-27T10:00:00.000Z" },
    }),
    send,
  };
}

describe("ScriptedInboundMessageClassifier", () => {
  it("returns appointment confirmations, reports, multiple attachments, and unsupported", async () => {
    const classifier = classifierWith([
      confirmation,
      { type: "report", attachmentIds: ["document-1"] },
      { type: "report", attachmentIds: ["document-1", "document-2"] },
      { type: "unsupported" },
    ]);
    const input = message("provider-message-1", [
      attachment("document-1"),
      attachment("document-2"),
    ]);

    await expect(classifier.classify(input)).resolves.toEqual(confirmation);
    await expect(classifier.classify(input)).resolves.toEqual({
      type: "report",
      attachmentIds: ["document-1"],
    });
    await expect(classifier.classify(input)).resolves.toEqual({
      type: "report",
      attachmentIds: ["document-1", "document-2"],
    });
    await expect(classifier.classify(input)).resolves.toEqual({ type: "unsupported" });
  });

  it("records a failure before throwing a generic error", async () => {
    const classifier = classifierWith([{ type: "failure" }]);
    await expect(classifier.classify(message())).rejects.toThrow(
      "Scripted inbound classification failed.",
    );
    expect(classifier.getHistory()).toHaveLength(1);
  });

  it("consumes successive steps in order and returns unsupported when exhausted", async () => {
    const classifier = classifierWith([
      { type: "failure" },
      { type: "unsupported" },
      confirmation,
    ]);
    await expect(classifier.classify(message())).rejects.toThrow();
    await expect(classifier.classify(message())).resolves.toEqual({ type: "unsupported" });
    await expect(classifier.classify(message())).resolves.toEqual(confirmation);
    await expect(classifier.classify(message())).resolves.toEqual({ type: "unsupported" });
  });

  it("returns unsupported for an unknown provider message", async () => {
    const classifier = classifierWith([confirmation]);
    await expect(classifier.classify(message("unknown-message"))).resolves.toEqual({
      type: "unsupported",
    });
  });

  it("keeps scenarios independent", async () => {
    const classifier = new ScriptedInboundMessageClassifier([
      { providerMessageId: "provider-message-1", steps: [confirmation] },
      { providerMessageId: "provider-message-2", steps: [{ type: "unsupported" }] },
    ]);
    await expect(classifier.classify(message("provider-message-2"))).resolves.toEqual({
      type: "unsupported",
    });
    await expect(classifier.classify(message("provider-message-1"))).resolves.toEqual(
      confirmation,
    );
  });

  it("consumes distinct ordered steps for simultaneous calls", async () => {
    const classifier = classifierWith([
      { type: "unsupported" },
      { type: "report", attachmentIds: ["document-1"] },
    ]);
    const results = await Promise.all([
      classifier.classify(message("provider-message-1", [attachment("document-1")])),
      classifier.classify(message("provider-message-1", [attachment("document-1")])),
    ]);
    expect(results).toEqual([
      { type: "unsupported" },
      { type: "report", attachmentIds: ["document-1"] },
    ]);
  });

  it("records valid calls in order and bounds history by dropping the oldest", async () => {
    const classifier = new ScriptedInboundMessageClassifier([], { historyLimit: 2 });
    await classifier.classify(message("provider-message-1"));
    await classifier.classify(message("provider-message-2"));
    await classifier.classify(message("provider-message-3"));
    expect(classifier.getHistory().map((entry) => entry.providerMessageId)).toEqual([
      "provider-message-2",
      "provider-message-3",
    ]);
  });

  it("returns defensive history arrays, messages, attachments, and bytes", async () => {
    const sourceBytes = new Uint8Array([7, 8, 9]);
    const classifier = new ScriptedInboundMessageClassifier([]);
    const input = message("provider-message-1", [attachment("document-1", sourceBytes)]);
    const pending = classifier.classify(input);
    sourceBytes.fill(0);
    await pending;

    const firstHistory = classifier.getHistory();
    expect(firstHistory[0]?.attachments[0]?.bytes).toEqual(new Uint8Array([7, 8, 9]));
    firstHistory[0]?.attachments[0]?.bytes.fill(4);
    Reflect.deleteProperty(firstHistory, "0");

    const secondHistory = classifier.getHistory();
    expect(secondHistory).toHaveLength(1);
    expect(secondHistory[0]?.attachments[0]?.bytes).toEqual(new Uint8Array([7, 8, 9]));
    expect(secondHistory).not.toBe(firstHistory);
    expect(secondHistory[0]).not.toBe(firstHistory[0]);
  });

  it("copies the original scenario configuration", async () => {
    const configuredIds = ["document-1"];
    const steps = [{ type: "report", attachmentIds: configuredIds }];
    const scenarios = [{ providerMessageId: "provider-message-1", steps }];
    const classifier = new ScriptedInboundMessageClassifier(scenarios);
    configuredIds[0] = "changed-document";
    steps.splice(0, 1, { type: "unsupported", attachmentIds: [] });
    scenarios.splice(0, 1);

    await expect(
      classifier.classify(message("provider-message-1", [attachment("document-1")])),
    ).resolves.toEqual({ type: "report", attachmentIds: ["document-1"] });
  });

  it("returns unsupported when a report references an attachment absent from the message", async () => {
    const classifier = classifierWith([
      { type: "report", attachmentIds: ["document-1"] },
    ]);
    await expect(classifier.classify(message())).resolves.toEqual({ type: "unsupported" });
  });

  it.each([
    ["duplicate scenarios", [
      { providerMessageId: "provider-message-1", steps: [{ type: "unsupported" }] },
      { providerMessageId: "provider-message-1", steps: [{ type: "unsupported" }] },
    ]],
    ["an empty provider id", [{ providerMessageId: "", steps: [{ type: "unsupported" }] }]],
    ["an invalid provider id", [{ providerMessageId: "invalid id", steps: [{ type: "unsupported" }] }]],
    ["an oversized provider id", [{
      providerMessageId: "p".repeat(inboxLimits.providerMessageIdCharacters + 1),
      steps: [{ type: "unsupported" }],
    }]],
    ["an unknown step", [{ providerMessageId: "provider-message-1", steps: [{ type: "other" }] }]],
    ["extra scenario fields", [{
      providerMessageId: "provider-message-1",
      steps: [{ type: "unsupported" }],
      diagnosis: "not allowed",
    }]],
    ["extra step fields", [{
      providerMessageId: "provider-message-1",
      steps: [{ type: "unsupported", interpretation: "not allowed" }],
    }]],
    ["an empty confirmation reference", [{
      providerMessageId: "provider-message-1",
      steps: [{ ...confirmation, reference: "" }],
    }]],
    ["a blank practitioner name", [{
      providerMessageId: "provider-message-1",
      steps: [{ ...confirmation, practitionerName: " " }],
    }]],
    ["confirmation dates without timezones", [{
      providerMessageId: "provider-message-1",
      steps: [{ ...confirmation, startsAt: "2026-12-02T09:00:00" }],
    }]],
    ["a confirmation ending before it starts", [{
      providerMessageId: "provider-message-1",
      steps: [{ ...confirmation, endsAt: "2026-12-02T08:59:00+01:00" }],
    }]],
    ["a confirmation with equal dates", [{
      providerMessageId: "provider-message-1",
      steps: [{ ...confirmation, endsAt: confirmation.startsAt }],
    }]],
    ["a report without attachment ids", [{
      providerMessageId: "provider-message-1",
      steps: [{ type: "report", attachmentIds: [] }],
    }]],
    ["a report with duplicate attachment ids", [{
      providerMessageId: "provider-message-1",
      steps: [{ type: "report", attachmentIds: ["document-1", "document-1"] }],
    }]],
    ["an empty step sequence", [{ providerMessageId: "provider-message-1", steps: [] }]],
  ])("rejects configuration with %s", (_label, scenarios) => {
    expect(() => new ScriptedInboundMessageClassifier(scenarios)).toThrow(
      "Invalid scripted inbound classifier configuration.",
    );
  });

  it("rejects too many scenarios and too many steps", () => {
    const tooManyScenarios = Array.from(
      { length: inboxLimits.scriptedScenarios + 1 },
      (_, index) => ({
        providerMessageId: `provider-message-${index}`,
        steps: [{ type: "unsupported" }],
      }),
    );
    const tooManySteps = Array.from(
      { length: inboxLimits.scriptedStepsPerScenario + 1 },
      () => ({ type: "unsupported" }),
    );
    expect(() => new ScriptedInboundMessageClassifier(tooManyScenarios)).toThrow();
    expect(() => new ScriptedInboundMessageClassifier([
      { providerMessageId: "provider-message-1", steps: tooManySteps },
    ])).toThrow();
  });

  it.each([
    ["zero history", { historyLimit: 0 }],
    ["fractional history", { historyLimit: 1.5 }],
    ["oversized history", { historyLimit: inboxLimits.scriptedHistoryEntries + 1 }],
    ["zero scenarios", { maximumScenarios: 0 }],
    ["oversized steps", { maximumStepsPerScenario: inboxLimits.scriptedStepsPerScenario + 1 }],
    ["unknown option", { historyLimit: 1, timerDelay: 10 }],
  ])("rejects invalid limits: %s", (_label, options) => {
    expect(() => new ScriptedInboundMessageClassifier([], options)).toThrow(
      "Invalid scripted inbound classifier configuration.",
    );
  });

  it("honors lower scenario and step limits", () => {
    expect(() => new ScriptedInboundMessageClassifier([
      { providerMessageId: "provider-message-1", steps: [{ type: "unsupported" }] },
      { providerMessageId: "provider-message-2", steps: [{ type: "unsupported" }] },
    ], { maximumScenarios: 1 })).toThrow();
    expect(() => new ScriptedInboundMessageClassifier([
      {
        providerMessageId: "provider-message-1",
        steps: [{ type: "unsupported" }, { type: "unsupported" }],
      },
    ], { maximumStepsPerScenario: 1 })).toThrow();
  });

  it("rejects an invalid message without recording it or leaking its fields", async () => {
    const classifier = classifierWith([{ type: "unsupported" }]);
    const invalid = { ...message(), providerMessageId: "invalid id" };
    const error = await classifier.classify(invalid).catch((reason: unknown) => reason);
    expect(error).toEqual(new Error("Invalid normalized inbound message."));
    expect(String(error)).not.toContain("invalid id");
    expect(classifier.getHistory()).toEqual([]);
  });
});

describe("ScriptedInboundMessageClassifier with createInbox", () => {
  it("creates an owner-validated appointment confirmation event", async () => {
    const classifier = classifierWith([confirmation]);
    const { inbox, send } = integrationInbox(classifier);
    const result = await inbox.ingestMessage(message());
    expect(result).toMatchObject({
      status: "processed",
      events: [{
        type: "appointment-confirmation-received",
        requiresOwnerValidation: true,
      }],
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("creates unverified document events for a valid report", async () => {
    const classifier = classifierWith([
      { type: "report", attachmentIds: ["document-1", "document-2"] },
    ]);
    const { inbox } = integrationInbox(classifier);
    const result = await inbox.ingestMessage(message("provider-message-1", [
      attachment("document-1"),
      attachment("document-2"),
    ]));
    expect(result).toMatchObject({
      status: "processed",
      events: [
        { type: "document-received", verification: "unverified" },
        { type: "document-received", verification: "unverified" },
      ],
    });
  });

  it("maps unsupported and failure to existing Inbox results", async () => {
    const unsupportedClassifier = classifierWith([{ type: "unsupported" }]);
    const failureClassifier = classifierWith([{ type: "failure" }]);
    expect((await integrationInbox(unsupportedClassifier).inbox.ingestMessage(message())).status)
      .toBe("unsupported");
    expect(await integrationInbox(failureClassifier).inbox.ingestMessage(message())).toEqual({
      status: "failed",
      error: {
        code: "CLASSIFICATION_FAILURE",
        message: "The inbound message could not be classified.",
      },
    });
  });

  it("retries the same message after failure and consumes the next step", async () => {
    const classifier = classifierWith([{ type: "failure" }, confirmation]);
    const { inbox } = integrationInbox(classifier);
    expect((await inbox.ingestMessage(message())).status).toBe("failed");
    expect((await inbox.ingestMessage(message())).status).toBe("processed");
    expect(classifier.getHistory()).toHaveLength(2);
  });

  it("does not create a document for a missing report attachment", async () => {
    const classifier = classifierWith([
      { type: "report", attachmentIds: ["document-1"] },
    ]);
    const { inbox } = integrationInbox(classifier);
    const result = await inbox.ingestMessage(message());
    expect(result.status).toBe("unsupported");
    expect(JSON.stringify(result)).not.toContain("document-received");
  });

  it("does not call the classifier again for an already processed message", async () => {
    const classifier = classifierWith([{ type: "unsupported" }, confirmation]);
    const { inbox } = integrationInbox(classifier);
    expect((await inbox.ingestMessage(message())).status).toBe("unsupported");
    expect((await inbox.ingestMessage(message())).status).toBe("duplicate");
    expect(classifier.getHistory()).toHaveLength(1);
  });
});
