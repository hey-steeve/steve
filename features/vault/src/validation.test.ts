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
    assertions: [{
      text: "The document states a follow-up date.",
      evidence: ["Follow-up on 20 November."],
    }],
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
    ["dot filename", { fileName: "." }, "fileName"],
    ["parent filename", { fileName: ".." }, "fileName"],
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

  test("rejects a mismatched PDF body and parameterized MIME types", async () => {
    const service = vault();
    const pdfInput = input();
    const parameterizedInput = input();
    Reflect.set(pdfInput, "mimeType", "application/pdf");
    Reflect.set(parameterizedInput, "mimeType", "text/plain; charset=utf-8");
    const pdf = await service.store(pdfInput);
    const parameterized = await service.store(parameterizedInput);

    expect(pdf).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "content" },
    });
    expect(parameterized).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_CONTENT_TYPE",
        message: "Document content type is not supported.",
        field: "mimeType",
      },
    });
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

  test("accepts content at the exact byte limit", async () => {
    const exact = await vault().store(
      input({ content: new Uint8Array(vaultLimits.contentBytes).fill(65) }),
    );

    expect(exact).toMatchObject({
      ok: true,
      value: { sizeBytes: vaultLimits.contentBytes },
    });
  });

  test("rejects oversized content before copying it", async () => {
    const clone = vi.spyOn(globalThis, "structuredClone");
    const copy = vi.spyOn(Uint8Array.prototype, "set");
    try {
      const over = await vault().store(
        input({ content: new Uint8Array(vaultLimits.contentBytes + 1).fill(65) }),
      );

      expect(over).toMatchObject({
        ok: false,
        error: { code: "CONTENT_TOO_LARGE", field: "content" },
      });
      expect(clone).not.toHaveBeenCalled();
      expect(copy).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
      copy.mockRestore();
    }
  });

  test("copies only the visible bytes of a view over a larger buffer", async () => {
    const backing = new Uint8Array(vaultLimits.contentBytes * 2);
    const offset = vaultLimits.contentBytes;
    backing.set(encoder.encode("0123456789"), offset);
    const view = backing.subarray(offset, offset + 10);

    const result = await vault().store(input({ content: view }));

    expect(result).toMatchObject({
      ok: true,
      value: { content: encoder.encode("0123456789"), sizeBytes: 10 },
    });
    if (!result.ok) {
      throw new Error("view fixture was rejected");
    }
    expect(result.value.content.buffer.byteLength).toBe(view.byteLength);
  });

  test("accepts exact identifier and filename limits and rejects one over", async () => {
    const exactId = "a".repeat(vaultLimits.documentIdCharacters);
    const exactFileName = `${"f".repeat(vaultLimits.fileNameCharacters - 4)}.txt`;
    const accepted = await vault().store(
      input({ id: exactId, fileName: exactFileName }),
    );
    const longId = await vault().store(
      input({ id: "a".repeat(vaultLimits.documentIdCharacters + 1) }),
    );
    const longFileName = await vault().store(
      input({
        fileName: `${"f".repeat(vaultLimits.fileNameCharacters - 3)}.txt`,
      }),
    );

    expect(accepted).toMatchObject({
      ok: true,
      value: { id: exactId, fileName: exactFileName },
    });
    expect(longId).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "id" },
    });
    expect(longFileName).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "fileName" },
    });
  });

  test("accepts exact metadata limits and a valid leap date", async () => {
    const title = "t".repeat(vaultLimits.metadataTitleCharacters);
    const source = "s".repeat(vaultLimits.metadataSourceCharacters);

    const result = await vault().store(
      input({ metadata: { title, source, documentDate: "2024-02-29" } }),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { metadata: { title, source, documentDate: "2024-02-29" } },
    });
  });

  test.each([
    ["blank title", { title: " " }, "metadata.title"],
    [
      "long title",
      { title: "t".repeat(vaultLimits.metadataTitleCharacters + 1) },
      "metadata.title",
    ],
    [
      "long source",
      { source: "s".repeat(vaultLimits.metadataSourceCharacters + 1) },
      "metadata.source",
    ],
    ["invalid date", { documentDate: "2026-02-29" }, "metadata.documentDate"],
    ["unknown field", { category: "report" }, "metadata"],
  ])("rejects %s metadata", async (_name, metadata, field) => {
    const document = input();
    Reflect.set(document, "metadata", metadata);
    const result = await vault().store(document);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field },
    });
  });

  test("rejects unknown document fields and non-byte content at runtime", async () => {
    const unknownInput = input();
    const stringInput = input();
    Reflect.set(unknownInput, "unsafePath", "/tmp/report.txt");
    Reflect.set(stringInput, "content", "private document text");
    const unknownField = await vault().store(unknownInput);
    const stringContent = await vault().store(stringInput);

    expect(unknownField).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT" },
    });
    expect(stringContent).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "content" },
    });
  });

  test("rejects inherited document fields", async () => {
    const document = input();
    Object.setPrototypeOf(document, { inherited: "unsafe" });

    const result = await vault().store(document);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT" },
    });
  });
});
