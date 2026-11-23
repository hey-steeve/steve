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
  (first.metadata as { title?: string }).title = "Changed again";
  const second = await storage.get(document.id);

  expect(second?.content).toEqual(new TextEncoder().encode("note"));
  expect(second?.metadata).toEqual({ title: "Synthetic note" });
});

test("returns null for an absent document", async () => {
  const storage = new InMemoryDocumentStorage();

  await expect(storage.get("doc_absent")).resolves.toBeNull();
});
