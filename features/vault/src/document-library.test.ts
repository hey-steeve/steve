import { describe, expect, test, vi } from "vitest";
import {
  InMemoryDocumentStorage,
  createVault,
  type DocumentStorage,
  type FactualSummaryProvider,
  type StoredDocument,
  type VaultDocumentInput,
} from "./index.ts";

const encoder = new TextEncoder();
const firstText = "Synthetic document alpha with a scheduled follow-up.";
const secondText = "Synthetic document beta with a requested laboratory test.";
const firstDigest = "03ef9502873a85b97a2c10dcb3a94296870be7b44487d804206ba7a8082a3564";

function input(
  id: string,
  content = firstText,
): VaultDocumentInput {
  return {
    id,
    fileName: `${id}.txt`,
    mimeType: "text/plain",
    content: encoder.encode(content),
    metadata: { title: `Title ${id}`, source: "synthetic fixture" },
  };
}

function provider(): FactualSummaryProvider {
  return {
    summarize: vi.fn(async () => ({
      assertions: [{
        text: "The document records a synthetic follow-up.",
        evidence: ["Synthetic document alpha"],
      }],
    })),
  };
}

function service(
  storage: DocumentStorage = new InMemoryDocumentStorage(),
  summarizer: FactualSummaryProvider = provider(),
) {
  let clock = 0;
  return createVault({
    storage,
    summarizer,
    generateId: () => "doc_generated",
    now: () => new Date(Date.UTC(2026, 10, 26, 12, 0, clock++)),
  });
}

function storedDocument(
  overrides: Partial<StoredDocument> = {},
): StoredDocument {
  return {
    id: "doc_alpha",
    fileName: "doc_alpha.txt",
    mimeType: "text/plain",
    sizeBytes: encoder.encode(firstText).byteLength,
    content: encoder.encode(firstText),
    contentDigest: firstDigest,
    metadata: { title: "Title doc_alpha", source: "synthetic fixture" },
    storedAt: "2026-11-26T12:00:00.000Z",
    ...overrides,
  };
}

function storageWith(
  overrides: Partial<DocumentStorage>,
): DocumentStorage {
  return {
    create: vi.fn(async () => "created" as const),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    delete: vi.fn(async () => "not-found" as const),
    ...overrides,
  };
}

describe("document library lifecycle", () => {
  test("lists metadata without exposing content and copies returned state", async () => {
    const vault = service();
    await vault.store(input("doc_alpha"));
    await vault.store(input("doc_beta", secondText));

    const listed = await vault.list();

    expect(listed).toMatchObject({
      ok: true,
      value: [
        { id: "doc_beta", metadata: { title: "Title doc_beta" } },
        { id: "doc_alpha", metadata: { title: "Title doc_alpha" } },
      ],
    });
    if (!listed.ok) {
      throw new Error("document list fixture failed");
    }
    expect(listed.value.every((item) => !("content" in item))).toBe(true);
    Reflect.set(listed.value[0]?.metadata ?? {}, "title", "Changed");
    await expect(vault.list()).resolves.toMatchObject({
      ok: true,
      value: [
        { id: "doc_beta", metadata: { title: "Title doc_beta" } },
        { id: "doc_alpha", metadata: { title: "Title doc_alpha" } },
      ],
    });
  });

  test("rejects duplicate content across different identifiers", async () => {
    const vault = service();

    const outcomes = await Promise.all([
      vault.store(input("doc_first")),
      vault.store(input("doc_second")),
    ]);

    expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
    expect(outcomes).toContainEqual({
      ok: false,
      error: {
        code: "DUPLICATE_CONTENT",
        message: "This document content is already stored.",
      },
    });
  });

  test("deletes a document, invalidates lookup, and permits a fresh copy", async () => {
    const vault = service();
    await vault.store(input("doc_alpha"));

    const deleted = await vault.delete("doc_alpha");
    const missing = await vault.get("doc_alpha");
    const deletedAgain = await vault.delete("doc_alpha");
    const restored = await vault.store(input("doc_restored"));

    expect(deleted).toEqual({ ok: true, value: { id: "doc_alpha" } });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_NOT_FOUND" },
    });
    expect(deletedAgain).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_NOT_FOUND" },
    });
    expect(restored).toMatchObject({ ok: true, value: { id: "doc_restored" } });
  });

  test("rejects an invalid delete identifier before storage", async () => {
    const storage = storageWith({});
    const vault = service(storage);

    const result = await vault.delete("../unsafe");

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT", field: "id" },
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  test("rejects content whose stored digest no longer matches", async () => {
    const storage = storageWith({
      get: vi.fn(async () => storedDocument({
        content: encoder.encode(secondText),
        sizeBytes: encoder.encode(secondText).byteLength,
      })),
    });
    const vault = service(storage);

    const result = await vault.get("doc_alpha");

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORAGE_FAILURE",
        message: "Document storage returned invalid data.",
      },
    });
  });

  test("validates hostile list output without consulting custom iterators", async () => {
    const { content: _content, ...item } = storedDocument();
    const listed = [item];
    Object.defineProperty(listed, Symbol.iterator, {
      value: function* emptyIterator() {
        return undefined;
      },
    });
    const storage = storageWith({ list: vi.fn(async () => listed) });
    const vault = service(storage);

    const result = await vault.list();

    expect(result).toMatchObject({
      ok: true,
      value: [{ id: "doc_alpha", contentDigest: firstDigest }],
    });
  });

  test("contains malformed list and delete adapter outcomes", async () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const validStorage = storageWith({});
    const malformedListStorage = new Proxy(validStorage, {
      get(target, property, receiver) {
        if (property === "list") {
          return async () => sparse;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const malformedDeleteStorage = new Proxy(validStorage, {
      get(target, property, receiver) {
        if (property === "delete") {
          return async () => "unexpected";
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const malformedList = service(malformedListStorage);
    const malformedDelete = service(malformedDeleteStorage);

    await expect(malformedList.list()).resolves.toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    await expect(malformedDelete.delete("doc_alpha")).resolves.toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
  });

  test("contains list and delete adapter exceptions", async () => {
    const storage = storageWith({
      list: vi.fn(async () => {
        throw new Error(firstText);
      }),
      delete: vi.fn(async () => {
        throw new Error(firstText);
      }),
    });
    const vault = service(storage);

    const listed = await vault.list();
    const deleted = await vault.delete("doc_alpha");

    expect(listed).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    expect(deleted).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    expect(JSON.stringify([listed, deleted])).not.toContain(firstText);
  });

  test("rejects duplicate identifiers or digests returned by list", async () => {
    const { content: _content, ...item } = storedDocument();
    const duplicateId = { ...item, contentDigest: "a".repeat(64) };
    const duplicateDigest = { ...item, id: "doc_other" };
    const duplicateIds = service(storageWith({
      list: vi.fn(async () => [item, duplicateId]),
    }));
    const duplicateDigests = service(storageWith({
      list: vi.fn(async () => [item, duplicateDigest]),
    }));

    await expect(duplicateIds.list()).resolves.toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
    await expect(duplicateDigests.list()).resolves.toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILURE" },
    });
  });
});

describe("summary cache", () => {
  test("coalesces concurrent requests and returns defensive cached copies", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const summarizer: FactualSummaryProvider = {
      summarize: vi.fn(async () => {
        await gate;
        return {
          assertions: [{
            text: "The document records a synthetic follow-up.",
            evidence: ["Synthetic document alpha"],
          }],
        };
      }),
    };
    const vault = service(new InMemoryDocumentStorage(), summarizer);
    await vault.store(input("doc_alpha"));

    const pending = [
      vault.summarize("doc_alpha"),
      vault.summarize("doc_alpha"),
      vault.summarize("doc_alpha"),
    ];
    await vi.waitFor(() => {
      expect(summarizer.summarize).toHaveBeenCalledTimes(1);
    });
    release();
    const results = await Promise.all(pending);
    const cached = await vault.summarize("doc_alpha");

    expect(results.every((result) => result.ok)).toBe(true);
    expect(cached).toMatchObject({ ok: true });
    expect(summarizer.summarize).toHaveBeenCalledTimes(1);
    if (!cached.ok) {
      throw new Error("cached summary fixture failed");
    }
    Reflect.set(cached.value.assertions[0] ?? {}, "text", "Changed");
    await expect(vault.summarize("doc_alpha")).resolves.toMatchObject({
      ok: true,
      value: {
        assertions: [{
          text: "The document records a synthetic follow-up.",
        }],
      },
    });
  });

  test("does not retain an in-flight summary after deletion", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const summarizer: FactualSummaryProvider = {
      summarize: vi.fn(async () => {
        await gate;
        return {
          assertions: [{
            text: "The document records a synthetic follow-up.",
            evidence: ["Synthetic document alpha"],
          }],
        };
      }),
    };
    const vault = service(new InMemoryDocumentStorage(), summarizer);
    await vault.store(input("doc_alpha"));
    const pending = vault.summarize("doc_alpha");
    await vi.waitFor(() => {
      expect(summarizer.summarize).toHaveBeenCalledTimes(1);
    });

    await vault.delete("doc_alpha");
    release();
    await pending;
    await vault.store(input("doc_alpha"));
    await vault.summarize("doc_alpha");

    expect(summarizer.summarize).toHaveBeenCalledTimes(2);
  });

  test("does not cache invalid summary output", async () => {
    const summarizer: FactualSummaryProvider = {
      summarize: vi.fn(async () => ({ assertions: [] })),
    };
    const vault = service(new InMemoryDocumentStorage(), summarizer);
    await vault.store(input("doc_alpha"));

    const first = await vault.summarize("doc_alpha");
    const second = await vault.summarize("doc_alpha");

    expect(first).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
    expect(second).toMatchObject({
      ok: false,
      error: { code: "INVALID_SUMMARY" },
    });
    expect(summarizer.summarize).toHaveBeenCalledTimes(2);
  });
});
