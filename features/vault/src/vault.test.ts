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

function storedDocument(
  overrides: Partial<StoredDocument> = {},
): StoredDocument {
  return {
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
    Reflect.set(stored.value.metadata, "title", "Changed");
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

  test("snapshots changing document and metadata getters once", async () => {
    const document = documentInput();
    const metadata = {
      source: "synthetic fixture",
      documentDate: "2026-11-12",
    };
    let idReads = 0;
    let fileNameReads = 0;
    let mimeTypeReads = 0;
    let contentReads = 0;
    let titleReads = 0;
    Object.defineProperty(document, "id", {
      enumerable: true,
      get() {
        idReads += 1;
        return idReads === 1 ? undefined : "doc_changed";
      },
    });
    Object.defineProperty(document, "fileName", {
      enumerable: true,
      get() {
        fileNameReads += 1;
        return fileNameReads === 1 ? "safe-note.txt" : "../secret";
      },
    });
    Object.defineProperty(document, "mimeType", {
      enumerable: true,
      get() {
        mimeTypeReads += 1;
        return mimeTypeReads === 1 ? "text/plain" : "application/pdf";
      },
    });
    Object.defineProperty(document, "content", {
      enumerable: true,
      get() {
        contentReads += 1;
        return contentReads === 1
          ? encoder.encode("Synthetic safe content.")
          : new Uint8Array(vaultLimits.contentBytes + 1).fill(65);
      },
    });
    Object.defineProperty(metadata, "title", {
      enumerable: true,
      get() {
        titleReads += 1;
        return titleReads === 1 ? "Safe title" : "Changed title";
      },
    });
    Object.defineProperty(document, "metadata", {
      enumerable: true,
      value: metadata,
    });
    const service = createVault(dependencies());

    const result = await service.store(document);

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "doc_generated",
        fileName: "safe-note.txt",
        mimeType: "text/plain",
        content: encoder.encode("Synthetic safe content."),
        metadata: { title: "Safe title" },
      },
    });
    expect({ idReads, fileNameReads, mimeTypeReads, contentReads, titleReads }).toEqual({
      idReads: 1,
      fileNameReads: 1,
      mimeTypeReads: 1,
      contentReads: 1,
      titleReads: 1,
    });
  });

  test("contains hostile records returned by storage", async () => {
    const hostileRecord = new Proxy(storedDocument(), {
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

  test("snapshots changing storage getters once", async () => {
    const record = storedDocument();
    let idReads = 0;
    let fileNameReads = 0;
    Object.defineProperty(record, "id", {
      enumerable: true,
      get() {
        idReads += 1;
        return idReads === 1 ? "doc_generated" : "doc_changed";
      },
    });
    Object.defineProperty(record, "fileName", {
      enumerable: true,
      get() {
        fileNameReads += 1;
        return fileNameReads === 1 ? "safe-note.txt" : "../secret";
      },
    });
    const storage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => record),
    };
    const service = createVault(dependencies({ storage }));

    const result = await service.get("doc_generated");

    expect(result).toMatchObject({
      ok: true,
      value: { id: "doc_generated", fileName: "safe-note.txt" },
    });
    expect({ idReads, fileNameReads }).toEqual({ idReads: 1, fileNameReads: 1 });
  });

  test("rejects a storage record for a different identifier", async () => {
    const storage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => storedDocument({ id: "doc_other" })),
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
    const malformed: StoredDocument = {
      id: "doc_generated",
      fileName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: 999,
      content: encoder.encode("short"),
      metadata: {},
      storedAt: "not-a-date",
    };
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
    const validStorage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => null),
    };
    const storage = new Proxy(validStorage, {
      get(target, property, receiver) {
        if (property === "create") {
          return async () => "unexpected";
        }
        return Reflect.get(target, property, receiver);
      },
    });
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

  test("requires a meaningful eight-character evidence anchor", async () => {
    const exact = "abc12345";
    const short = "abc1234";
    const punctuation = "........";
    const source = `${exact} ${short} ${punctuation}`;

    const accepted = await summarizeOutput(source, {
      assertions: [{ text: "Fact.", evidence: [`  ${exact}  `] }],
    });
    const shortResult = await summarizeOutput(source, {
      assertions: [{ text: "Fact.", evidence: [short] }],
    });
    const punctuationResult = await summarizeOutput(source, {
      assertions: [{ text: "Fact.", evidence: [punctuation] }],
    });

    expect(accepted).toMatchObject({
      ok: true,
      value: { assertions: [{ evidence: [exact] }] },
    });
    expect(shortResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
    expect(punctuationResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
  });

  test("accepts a verbatim multi-line evidence excerpt", async () => {
    const excerpt = "Line one\nLine two";

    const result = await summarizeOutput(excerpt, {
      assertions: [{ text: "The document has two lines.", evidence: [excerpt] }],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { assertions: [{ evidence: [excerpt] }] },
    });
  });
});

describe("untrusted summary output", () => {
  test("contains hostile summary objects and properties", async () => {
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
    const outputs = [
      hostileObject,
      hostileProperty,
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

  test("ignores custom iterators and snapshots indexed arrays", async () => {
    const indexedEvidence = [evidence];
    Object.defineProperty(indexedEvidence, Symbol.iterator, {
      value: function* emptyEvidenceIterator() {
        return undefined;
      },
    });
    const indexedAssertions = [{ text: "Fact.", evidence: indexedEvidence }];
    Object.defineProperty(indexedAssertions, Symbol.iterator, {
      value: function* emptyAssertionIterator() {
        return undefined;
      },
    });
    const service = createVault(
      dependencies({ summarizer: provider({ assertions: indexedAssertions }) }),
    );
    await service.store(documentInput());

    const result = await service.summarize("doc_generated");

    expect(result).toMatchObject({
      ok: true,
      value: { assertions: [{ text: "Fact.", evidence: [evidence] }] },
    });
  });

  test("rejects sparse arrays even when a custom iterator yields values", async () => {
    const sparseAssertions: unknown[] = [];
    sparseAssertions.length = 1;
    Object.defineProperty(sparseAssertions, Symbol.iterator, {
      value: function* customIterator() {
        yield { text: "Fact.", evidence: [evidence] };
      },
    });
    const service = createVault(
      dependencies({ summarizer: provider({ assertions: sparseAssertions }) }),
    );
    await service.store(documentInput());

    const result = await service.summarize("doc_generated");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
  });

  test("snapshots changing summary getters once", async () => {
    let assertionsReads = 0;
    let textReads = 0;
    let evidenceReads = 0;
    const assertion = Object.defineProperty({}, "text", {
      enumerable: true,
      get() {
        textReads += 1;
        return textReads === 1 ? "Fact." : "Changed fact.";
      },
    });
    Object.defineProperty(assertion, "evidence", {
      enumerable: true,
      get() {
        evidenceReads += 1;
        return evidenceReads === 1 ? [evidence] : [];
      },
    });
    const output = Object.defineProperty({}, "assertions", {
      enumerable: true,
      get() {
        assertionsReads += 1;
        return assertionsReads === 1 ? [assertion] : [];
      },
    });
    const service = createVault(dependencies({ summarizer: provider(output) }));
    await service.store(documentInput());

    const result = await service.summarize("doc_generated");

    expect(result).toMatchObject({
      ok: true,
      value: { assertions: [{ text: "Fact.", evidence: [evidence] }] },
    });
    expect({ assertionsReads, textReads, evidenceReads }).toEqual({
      assertionsReads: 1,
      textReads: 1,
      evidenceReads: 1,
    });
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
    ["duplicate assertion text", {
      assertions: [
        { text: "Same fact.", evidence: ["Consultation on 12 November."] },
        { text: "Same fact.", evidence: [evidence] },
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
