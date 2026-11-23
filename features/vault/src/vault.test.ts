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
  summary: "The note requests a blood test before the next appointment.",
  evidence: [evidence],
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
        summary: "The note requests a blood test before the next appointment.",
        evidence: [evidence],
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

describe("untrusted summary output", () => {
  test.each([
    ["null", null],
    ["unknown field", { summary: "Fact.", evidence: [evidence], extra: true }],
    ["blank summary", { summary: " ", evidence: [evidence] }],
    [
      "long summary",
      { summary: "s".repeat(vaultLimits.summaryCharacters + 1), evidence: [evidence] },
    ],
    ["no evidence", { summary: "Fact.", evidence: [] }],
    ["invented evidence", { summary: "Fact.", evidence: ["Not in the source."] }],
    ["duplicate evidence", { summary: "Fact.", evidence: [evidence, evidence] }],
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
