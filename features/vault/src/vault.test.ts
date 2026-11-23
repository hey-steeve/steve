import { describe, expect, test, vi } from "vitest";
import {
  InMemoryDocumentStorage,
  createVault,
  factualSummaryRules,
  supportedDocumentMimeTypes,
  vaultLimits,
  type DocumentStorage,
  type FactualSummaryProvider,
  type StoredDocument,
  type VaultDependencies,
  type VaultDocumentInput,
} from "./index.ts";

const text =
  "Consultation on 12 November. A blood test is requested before the next appointment.";
const evidence = "A blood test is requested before the next appointment.";
const encoder = new TextEncoder();

function documentInput(
  overrides: Partial<VaultDocumentInput> = {},
): VaultDocumentInput {
  return {
    fileName: "consultation-note.md",
    mimeType: "text/markdown",
    content: encoder.encode(text),
    metadata: {
      title: "Consultation note",
      source: "synthetic fixture",
      documentDate: "2026-11-12",
    },
    ...overrides,
  };
}

function provider(output: unknown = {
  assertions: [{
    text: "The note requests a blood test before the next appointment.",
    evidence: [evidence],
  }],
}): FactualSummaryProvider {
  return { summarize: vi.fn(async () => output) };
}

function dependencies(
  overrides: Partial<VaultDependencies> = {},
): VaultDependencies {
  return {
    storage: new InMemoryDocumentStorage(),
    summarizer: provider(),
    generateId: () => "doc_generated",
    now: () => new Date("2026-11-23T20:00:00.000Z"),
    ...overrides,
  };
}

describe("Vault document lifecycle", () => {
  test("keeps exported safety policy and validation limits immutable", () => {
    expect(Object.isFrozen(factualSummaryRules)).toBe(true);
    expect(Object.isFrozen(supportedDocumentMimeTypes)).toBe(true);
    expect(Object.isFrozen(vaultLimits)).toBe(true);
  });

  test("stores, retrieves, and factually summarizes a document", async () => {
    const summarizer = provider();
    const service = createVault(dependencies({ summarizer }));

    const stored = await service.store(documentInput());
    const retrieved = await service.get("doc_generated");
    const summary = await service.summarize("doc_generated");

    expect(stored).toEqual({
      ok: true,
      value: {
        id: "doc_generated",
        fileName: "consultation-note.md",
        mimeType: "text/markdown",
        sizeBytes: encoder.encode(text).byteLength,
        content: encoder.encode(text),
        metadata: {
          title: "Consultation note",
          source: "synthetic fixture",
          documentDate: "2026-11-12",
        },
        storedAt: "2026-11-23T20:00:00.000Z",
      },
    });
    expect(retrieved).toEqual(stored);
    expect(summary).toEqual({
      ok: true,
      value: {
        documentId: "doc_generated",
        assertions: [{
          text: "The note requests a blood test before the next appointment.",
          evidence: [evidence],
        }],
        generatedAt: "2026-11-23T20:00:00.000Z",
      },
    });
    expect(summarizer.summarize).toHaveBeenCalledWith({
      document: {
        id: "doc_generated",
        fileName: "consultation-note.md",
        mimeType: "text/markdown",
        text,
      },
      rules: factualSummaryRules,
    });
  });

  test("returns multiple assertions with their own source evidence", async () => {
    const firstEvidence = "Consultation on 12 November.";
    const summarizer = provider({
      assertions: [
        { text: "The consultation is dated 12 November.", evidence: [firstEvidence] },
        {
          text: "The note requests a blood test before the next appointment.",
          evidence: [evidence],
        },
      ],
    });
    const service = createVault(dependencies({ summarizer }));
    await service.store(documentInput());

    const result = await service.summarize("doc_generated");

    expect(result).toMatchObject({
      ok: true,
      value: {
        assertions: [
          { text: "The consultation is dated 12 November.", evidence: [firstEvidence] },
          {
            text: "The note requests a blood test before the next appointment.",
            evidence: [evidence],
          },
        ],
      },
    });
  });

  test("keeps a provided stable identifier without generating another", async () => {
    const generateId = vi.fn(() => "doc_unused");
    const service = createVault(dependencies({ generateId }));

    const result = await service.store(documentInput({ id: "doc_supplied" }));

    expect(result).toMatchObject({ ok: true, value: { id: "doc_supplied" } });
    expect(generateId).not.toHaveBeenCalled();
  });

  test("rejects duplicate state without replacing the first document", async () => {
    const service = createVault(dependencies());
    await service.store(documentInput({ id: "doc_duplicate" }));

    const duplicate = await service.store(
      documentInput({
        id: "doc_duplicate",
        content: encoder.encode("A different synthetic document."),
      }),
    );
    const retrieved = await service.get("doc_duplicate");

    expect(duplicate).toEqual({
      ok: false,
      error: {
        code: "DUPLICATE_DOCUMENT",
        message: "A document with this identifier already exists.",
      },
    });
    expect(retrieved).toMatchObject({
      ok: true,
      value: { content: encoder.encode(text) },
    });
  });

  test("does not expose mutable stored state", async () => {
    const mutableInput = documentInput({ id: "doc_immutable" });
    const service = createVault(dependencies());
    const stored = await service.store(mutableInput);
    if (!stored.ok) {
      throw new Error("fixture did not store");
    }

    mutableInput.content[0] = 88;
    stored.value.content[1] = 88;
    (stored.value.metadata as { title?: string }).title = "Changed";
    const retrieved = await service.get("doc_immutable");
    if (!retrieved.ok) {
      throw new Error("fixture was not retrieved");
    }
    retrieved.value.content[2] = 88;
    const again = await service.get("doc_immutable");

    expect(again).toMatchObject({
      ok: true,
      value: {
        content: encoder.encode(text),
        metadata: { title: "Consultation note" },
      },
    });
  });

  test("returns explicit lookup errors before calling storage", async () => {
    const storage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => null),
    };
    const service = createVault(dependencies({ storage }));

    const invalid = await service.get("../private");
    const missing = await service.get("doc_missing");

    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "id" },
    });
    expect(missing).toEqual({
      ok: false,
      error: { code: "DOCUMENT_NOT_FOUND", message: "Document was not found." },
    });
    expect(storage.get).toHaveBeenCalledTimes(1);
  });
});

describe("dependency failures", () => {
  test("contains hostile input getters and proxies", async () => {
    const hostileGetter = Object.defineProperty(documentInput(), "id", {
      get() {
        throw new Error("hostile input getter");
      },
    });
    const hostileProxy = new Proxy(documentInput(), {
      ownKeys() {
        throw new Error("hostile input proxy");
      },
    });
    const service = createVault(dependencies());

    const getterResult = await service.store(hostileGetter);
    const proxyResult = await service.store(hostileProxy);

    expect(getterResult).toEqual({
      ok: false,
      error: { code: "INVALID_DOCUMENT", message: "Document input is invalid." },
    });
    expect(proxyResult).toEqual({
      ok: false,
      error: { code: "INVALID_DOCUMENT", message: "Document input is invalid." },
    });
  });

  test("contains hostile records returned by storage", async () => {
    const hostileRecord = new Proxy({} as StoredDocument, {
      ownKeys() {
        throw new Error("hostile storage record");
      },
    });
    const storage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => hostileRecord),
    };
    const service = createVault(dependencies({ storage }));

    const result = await service.get("doc_generated");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_FAILURE",
        message: "Document storage returned invalid data.",
      },
    });
  });

  test("maps storage exceptions without leaking document content", async () => {
    const storage: DocumentStorage = {
      create: vi.fn(async () => {
        throw new Error(`database rejected ${text}`);
      }),
      get: vi.fn(async () => {
        throw new Error(`database returned ${text}`);
      }),
    };
    const service = createVault(dependencies({ storage }));

    const storeResult = await service.store(documentInput());
    const getResult = await service.get("doc_generated");
    const serialized = JSON.stringify([storeResult, getResult]);

    expect(storeResult).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    expect(getResult).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    expect(serialized).not.toContain(text);
  });

  test("rejects malformed data returned by a storage adapter", async () => {
    const malformed = {
      id: "doc_generated",
      fileName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: 999,
      content: encoder.encode("short"),
      metadata: {},
      storedAt: "not-a-date",
    } as StoredDocument;
    const storage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => malformed),
    };
    const service = createVault(dependencies({ storage }));

    const result = await service.get("doc_generated");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_FAILURE",
        message: "Document storage returned invalid data.",
      },
    });
  });

  test("rejects invalid storage outcomes", async () => {
    const storage: DocumentStorage = {
      create: vi.fn(async () => "unexpected" as "created"),
      get: vi.fn(async () => null),
    };
    const service = createVault(dependencies({ storage }));

    const result = await service.store(documentInput());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
  });

  test("maps identifier and clock failures explicitly", async () => {
    const idFailure = createVault(
      dependencies({
        generateId: () => {
          throw new Error("random source failed");
        },
      }),
    );
    const clockFailure = createVault(
      dependencies({ now: () => new Date(Number.NaN) }),
    );

    await expect(idFailure.store(documentInput())).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_FAILURE" },
    });
    await expect(clockFailure.store(documentInput())).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_FAILURE" },
    });
  });
});

describe("summary validation boundaries", () => {
  async function summarizeOutput(source: string, output: unknown) {
    const service = createVault(dependencies({ summarizer: provider(output) }));
    await service.store(documentInput({ content: encoder.encode(source) }));
    return service.summarize("doc_generated");
  }

  test("accepts the maximum assertion and evidence counts", async () => {
    const excerpts = Array.from(
      { length: vaultLimits.summaryAssertions },
      (_, assertionIndex) => Array.from(
        { length: vaultLimits.evidencePerAssertion },
        (_, evidenceIndex) => `Evidence ${assertionIndex}-${evidenceIndex}.`,
      ),
    );
    const assertions = excerpts.map((items, index) => ({
      text: `Assertion ${index}.`,
      evidence: items,
    }));

    const result = await summarizeOutput(excerpts.flat().join(" "), { assertions });

    expect(result).toMatchObject({ ok: true, value: { assertions } });
  });

  test("rejects one assertion or evidence item over the limits", async () => {
    const tooManyAssertions = Array.from(
      { length: vaultLimits.summaryAssertions + 1 },
      (_, index) => ({ text: `Assertion ${index}.`, evidence: [evidence] }),
    );
    const evidenceItems = Array.from(
      { length: vaultLimits.evidencePerAssertion + 1 },
      (_, index) => `Evidence item ${index}.`,
    );

    const assertionResult = await summarizeOutput(text, {
      assertions: tooManyAssertions,
    });
    const evidenceResult = await summarizeOutput(evidenceItems.join(" "), {
      assertions: [{ text: "Fact.", evidence: evidenceItems }],
    });

    expect(assertionResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
    expect(evidenceResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
  });

  test("accepts exact assertion and evidence lengths", async () => {
    const assertion = "a".repeat(vaultLimits.assertionCharacters);
    const excerpt = "e".repeat(vaultLimits.evidenceCharacters);

    const result = await summarizeOutput(excerpt, {
      assertions: [{ text: assertion, evidence: [excerpt] }],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { assertions: [{ text: assertion, evidence: [excerpt] }] },
    });
  });

  test("rejects assertion and evidence lengths one over the limits", async () => {
    const longAssertion = "a".repeat(vaultLimits.assertionCharacters + 1);
    const longEvidence = "e".repeat(vaultLimits.evidenceCharacters + 1);

    const assertionResult = await summarizeOutput(evidence, {
      assertions: [{ text: longAssertion, evidence: [evidence] }],
    });
    const evidenceResult = await summarizeOutput(longEvidence, {
      assertions: [{ text: "Fact.", evidence: [longEvidence] }],
    });

    expect(assertionResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
    expect(evidenceResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
  });
});

describe("untrusted summary output", () => {
  test("contains hostile summary objects, properties, and arrays", async () => {
    const hostileObject = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile summary object");
      },
    });
    const hostileProperty = Object.defineProperty({}, "assertions", {
      enumerable: true,
      get() {
        throw new Error("hostile summary property");
      },
    });
    const hostileAssertions = new Proxy([{
      text: "Fact.",
      evidence: [evidence],
    }], {
      get(target, property, receiver) {
        if (property === Symbol.iterator) {
          throw new Error("hostile summary array");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const outputs = [
      hostileObject,
      hostileProperty,
      { assertions: hostileAssertions },
    ];

    for (const output of outputs) {
      const service = createVault(dependencies({ summarizer: provider(output) }));
      await service.store(documentInput());

      const result = await service.summarize("doc_generated");

      expect(result).toEqual({
        ok: false,
        error: {
          code: "INVALID_SUMMARY",
          message: "Summary provider returned an invalid result.",
        },
      });
    }
  });

  test.each([
    ["null", null],
    ["unknown field", {
      assertions: [{ text: "Fact.", evidence: [evidence] }],
      extra: true,
    }],
    ["blank assertion", { assertions: [{ text: " ", evidence: [evidence] }] }],
    [
      "long assertion",
      {
        assertions: [{
          text: "s".repeat(vaultLimits.assertionCharacters + 1),
          evidence: [evidence],
        }],
      },
    ],
    ["no assertions", { assertions: [] }],
    ["no evidence", { assertions: [{ text: "Fact.", evidence: [] }] }],
    ["invented evidence", {
      assertions: [{ text: "Fact.", evidence: ["Not in the source."] }],
    }],
    ["duplicate evidence", {
      assertions: [{ text: "Fact.", evidence: [evidence, evidence] }],
    }],
    ["evidence reused by another assertion", {
      assertions: [
        { text: "First fact.", evidence: [evidence] },
        { text: "Second fact.", evidence: [evidence] },
      ],
    }],
    ["unknown assertion field", {
      assertions: [{ text: "Fact.", evidence: [evidence], confidence: 1 }],
    }],
  ])("rejects %s", async (_name, output) => {
    const service = createVault(dependencies({ summarizer: provider(output) }));
    await service.store(documentInput());

    const result = await service.summarize("doc_generated");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_SUMMARY",
        message: "Summary provider returned an invalid result.",
      },
    });
  });

  test("maps provider exceptions without leaking contents", async () => {
    const summarizer: FactualSummaryProvider = {
      summarize: vi.fn(async (request) => {
        throw new Error(`provider rejected ${request.document.text}`);
      }),
    };
    const service = createVault(dependencies({ summarizer }));
    await service.store(documentInput());

    const result = await service.summarize("doc_generated");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SUMMARIZATION_FAILURE",
        message: "Document summarization failed.",
      },
    });
    expect(JSON.stringify(result)).not.toContain(text);
  });
});
