import { describe, expect, test, vi } from "vitest";
import {
  InMemoryDocumentStorage,
  createVault,
  vaultLimits,
  type DocumentStorage,
  type FactualSummaryProvider,
  type StoredDocument,
} from "./index.ts";
import { digestContent } from "./content-digest.ts";
import {
  syntheticCompressedOperatorPdf,
  syntheticPdf,
} from "./test-pdf-fixture.ts";

function service(summarizer?: FactualSummaryProvider) {
  return createVault({
    storage: new InMemoryDocumentStorage(),
    summarizer: summarizer ?? {
      summarize: vi.fn(async () => ({
        assertions: [{
          text: "The document requests a synthetic follow-up.",
          evidence: ["Synthetic PDF follow-up."],
        }],
      })),
    },
    generateId: () => "doc_pdf",
    now: () => new Date("2026-11-26T12:00:00.000Z"),
  });
}

describe("PDF document ingestion", () => {
  test("stores and summarizes a bounded PDF with extractable text", async () => {
    const summarizer: FactualSummaryProvider = {
      summarize: vi.fn(async () => ({
        assertions: [{
          text: "The document requests a synthetic follow-up.",
          evidence: ["Synthetic PDF follow-up."],
        }],
      })),
    };
    const vault = service(summarizer);
    const content = syntheticPdf(["Synthetic PDF follow-up."]);

    const stored = await vault.store({
      fileName: "synthetic-follow-up.pdf",
      mimeType: "application/pdf",
      content,
      metadata: { source: "synthetic fixture" },
    });
    const summary = await vault.summarize("doc_pdf");

    expect(stored).toMatchObject({
      ok: true,
      value: {
        mimeType: "application/pdf",
        sizeBytes: content.byteLength,
      },
    });
    expect(summary).toMatchObject({
      ok: true,
      value: {
        assertions: [{ evidence: ["Synthetic PDF follow-up."] }],
      },
    });
    expect(summarizer.summarize).toHaveBeenCalledWith({
      document: {
        id: "doc_pdf",
        fileName: "synthetic-follow-up.pdf",
        mimeType: "application/pdf",
        text: "Synthetic PDF follow-up.",
      },
      rules: expect.any(Object),
    });
  });

  test("rejects a PDF marker with malformed bytes", async () => {
    const result = await service().store({
      fileName: "malformed.pdf",
      mimeType: "application/pdf",
      content: new TextEncoder().encode("%PDF-not-a-document"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "content" },
    });
  });

  test("rejects invalid extracted text returned by storage", async () => {
    const content = new TextEncoder().encode("%PDF-not-a-document");
    const contentDigest = await digestContent(content);
    if (contentDigest === null) {
      throw new Error("digest fixture failed");
    }
    const stored: StoredDocument = {
      id: "doc_pdf",
      fileName: "malformed.pdf",
      mimeType: "application/pdf",
      sizeBytes: content.byteLength,
      content,
      extractedText: "",
      contentDigest,
      metadata: {},
      storedAt: "2026-11-26T12:00:00.000Z",
    };
    const storage: DocumentStorage = {
      create: vi.fn(async () => "created" as const),
      get: vi.fn(async () => stored),
      list: vi.fn(async () => []),
      delete: vi.fn(async () => "not-found" as const),
    };
    const vault = createVault({
      storage,
      summarizer: { summarize: vi.fn(async () => ({ assertions: [] })) },
    });

    const result = await vault.get("doc_pdf");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_FAILURE",
        message: "Document storage returned invalid data.",
      },
    });
  });

  test.each([
    ["medium", 8_000_000],
    ["large", 16_000_000],
  ])(
    "rejects a %s compressed operator stream within the processing deadline",
    async (_size, operatorPairs) => {
      const content = syntheticCompressedOperatorPdf(operatorPairs);
      expect(content.byteLength).toBeLessThan(vaultLimits.contentBytes);
      const startedAt = performance.now();

      const result = await service().store({
        fileName: "compressed-operator-stream.pdf",
        mimeType: "application/pdf",
        content,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "CONTENT_TOO_LARGE", field: "content" },
      });
      expect(performance.now() - startedAt).toBeLessThan(3_000);
    },
    5_000,
  );

  test("rejects a PDF without extractable text", async () => {
    const result = await service().store({
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      content: syntheticPdf([""]),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "content" },
    });
  });

  test("rejects a PDF above the page limit", async () => {
    const result = await service().store({
      fileName: "too-many-pages.pdf",
      mimeType: "application/pdf",
      content: syntheticPdf(
        Array.from(
          { length: vaultLimits.pdfPages + 1 },
          (_, index) => `Synthetic page ${index + 1}.`,
        ),
      ),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONTENT_TOO_LARGE", field: "content" },
    });
  });

  test("rejects extracted PDF text above its character limit", async () => {
    const result = await service().store({
      fileName: "too-much-text.pdf",
      mimeType: "application/pdf",
      content: syntheticPdf(
        Array.from(
          { length: vaultLimits.pdfPages },
          () => "a".repeat(
            Math.ceil(vaultLimits.extractedTextCharacters / vaultLimits.pdfPages) + 1,
          ),
        ),
      ),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONTENT_TOO_LARGE", field: "content" },
    });
  });
});
