import { describe, expect, test, vi } from "vitest";
import {
  InMemoryDocumentStorage,
  createVault,
  vaultLimits,
  type FactualSummaryProvider,
  type VaultDocumentInput,
} from "./index.ts";

const encoder = new TextEncoder();

const summarizer: FactualSummaryProvider = {
  summarize: vi.fn(async () => ({
    summary: "The document states a follow-up date.",
    evidence: ["Follow-up on 20 November."],
  })),
};

function input(overrides: Partial<VaultDocumentInput> = {}): VaultDocumentInput {
  return {
    id: "doc_validation",
    fileName: "follow-up.txt",
    mimeType: "text/plain",
    content: encoder.encode("Follow-up on 20 November."),
    ...overrides,
  };
}

function vault() {
  return createVault({
    storage: new InMemoryDocumentStorage(),
    summarizer,
    now: () => new Date("2026-11-23T20:00:00.000Z"),
  });
}

describe("document validation", () => {
  test.each([
    ["empty identifier", { id: "" }, "id"],
    ["identifier punctuation", { id: "doc:unsafe" }, "id"],
    ["parent path", { fileName: "../report.txt" }, "fileName"],
    ["Windows path", { fileName: "folder\\report.txt" }, "fileName"],
    ["blank filename", { fileName: "   " }, "fileName"],
    ["control in filename", { fileName: "report\u0000.txt" }, "fileName"],
  ])("rejects %s", async (_name, overrides, field) => {
    const result = await vault().store(input(overrides));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field },
    });
  });

  test("rejects unsupported and parameterized MIME types", async () => {
    const service = vault();
    const pdf = await service.store(
      input({ mimeType: "application/pdf" as "text/plain" }),
    );
    const parameterized = await service.store(
      input({ mimeType: "text/plain; charset=utf-8" as "text/plain" }),
    );

    expect([pdf, parameterized]).toEqual([
      {
        ok: false,
        error: {
          code: "UNSUPPORTED_CONTENT_TYPE",
          message: "Document content type is not supported.",
          field: "mimeType",
        },
      },
      {
        ok: false,
        error: {
          code: "UNSUPPORTED_CONTENT_TYPE",
          message: "Document content type is not supported.",
          field: "mimeType",
        },
      },
    ]);
  });

  test.each([
    ["empty", new Uint8Array()],
    ["whitespace", encoder.encode(" \n\t ")],
    ["NUL", encoder.encode("safe\u0000unsafe")],
    ["invalid UTF-8", new Uint8Array([0xc3, 0x28])],
  ])("rejects %s content", async (_name, content) => {
    const result = await vault().store(input({ content }));

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "content" },
    });
  });

  test("enforces the byte limit", async () => {
    const result = await vault().store(
      input({ content: new Uint8Array(vaultLimits.contentBytes + 1).fill(65) }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONTENT_TOO_LARGE", field: "content" },
    });
  });

  test.each([
    ["blank title", { title: " " }, "metadata.title"],
    [
      "long source",
      { source: "s".repeat(vaultLimits.metadataSourceCharacters + 1) },
      "metadata.source",
    ],
    ["invalid date", { documentDate: "2026-02-29" }, "metadata.documentDate"],
    ["unknown field", { category: "report" }, "metadata"],
  ])("rejects %s metadata", async (_name, metadata, field) => {
    const result = await vault().store(
      input({ metadata: metadata as { title?: string } }),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field },
    });
  });

  test("rejects unknown document fields and non-byte content at runtime", async () => {
    const unknownField = await vault().store({
      ...input(),
      unsafePath: "/tmp/report.txt",
    } as VaultDocumentInput);
    const stringContent = await vault().store({
      ...input(),
      content: "private document text",
    } as unknown as VaultDocumentInput);

    expect(unknownField).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT" },
    });
    expect(stringContent).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "content" },
    });
  });
});
