import { expect, test } from "vitest";
import {
  InMemoryDocumentStorage,
  type StoredDocument,
} from "./index.ts";

const document: StoredDocument = {
  id: "doc_storage",
  fileName: "note.txt",
  mimeType: "text/plain",
  sizeBytes: 4,
  content: new TextEncoder().encode("note"),
  contentDigest: "edb465624291e4053c6c5ea4b7eb320dec773e10a57d26b95dcf0564f8e310f8",
  metadata: { title: "Synthetic note" },
  storedAt: "2026-11-23T20:00:00.000Z",
};

test("creates once atomically when calls race", async () => {
  const storage = new InMemoryDocumentStorage();

  const outcomes = await Promise.all([
    storage.create(document),
    storage.create(document),
    storage.create(document),
  ]);

  expect(outcomes.filter((outcome) => outcome === "created")).toHaveLength(1);
  expect(outcomes.filter((outcome) => outcome === "duplicate")).toHaveLength(2);
});

test("rejects duplicate content atomically across different identifiers", async () => {
  const storage = new InMemoryDocumentStorage();

  const outcomes = await Promise.all([
    storage.create({ ...document, id: "doc_first" }),
    storage.create({ ...document, id: "doc_second" }),
  ]);

  expect(outcomes.filter((outcome) => outcome === "created")).toHaveLength(1);
  expect(
    outcomes.filter((outcome) => outcome === "duplicate-content"),
  ).toHaveLength(1);
});

test("copies bytes and metadata on write and read", async () => {
  const storage = new InMemoryDocumentStorage();
  const mutableContent = new Uint8Array(document.content);
  const mutableMetadata = { title: "Synthetic note" };
  const mutableDocument = {
    ...document,
    content: mutableContent,
    metadata: mutableMetadata,
  };
  await storage.create(mutableDocument);

  mutableContent[0] = 88;
  mutableMetadata.title = "Changed";
  const first = await storage.get(document.id);
  if (first === null) {
    throw new Error("missing stored fixture");
  }
  first.content[1] = 88;
  Reflect.set(first.metadata, "title", "Changed again");
  const second = await storage.get(document.id);

  expect(second?.content).toEqual(new TextEncoder().encode("note"));
  expect(second?.metadata).toEqual({ title: "Synthetic note" });
});

test("returns null for an absent document", async () => {
  const storage = new InMemoryDocumentStorage();

  await expect(storage.get("doc_absent")).resolves.toBeNull();
});

test("lists metadata without content in newest-first order", async () => {
  const storage = new InMemoryDocumentStorage();
  await storage.create({
    ...document,
    id: "doc_old",
    storedAt: "2026-11-22T20:00:00.000Z",
  });
  await storage.create({
    ...document,
    id: "doc_new",
    content: new TextEncoder().encode("new note"),
    contentDigest: "f83c43d111c79f797b88b0aa56256c2488d48847e242af7181fd33afd4c3f01a",
    sizeBytes: 8,
    storedAt: "2026-11-24T20:00:00.000Z",
  });

  const listed = await storage.list(500);

  expect(listed.map((item) => item.id)).toEqual(["doc_new", "doc_old"]);
  expect(listed.every((item) => !("content" in item))).toBe(true);
  await expect(storage.list(1)).resolves.toHaveLength(1);
  Reflect.set(listed[0]?.metadata ?? {}, "title", "Changed");
  await expect(storage.list(500)).resolves.toMatchObject([
    { id: "doc_new", metadata: { title: "Synthetic note" } },
    { id: "doc_old", metadata: { title: "Synthetic note" } },
  ]);
});

test("deletes a document and releases its digest", async () => {
  const storage = new InMemoryDocumentStorage();
  await storage.create(document);

  await expect(storage.delete(document.id)).resolves.toBe("deleted");
  await expect(storage.delete(document.id)).resolves.toBe("not-found");
  await expect(storage.create({ ...document, id: "doc_reused" })).resolves.toBe(
    "created",
  );
});
