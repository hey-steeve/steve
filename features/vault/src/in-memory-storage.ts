import type {
  DocumentStorage,
  DocumentStorageCreateResult,
  StoredDocument,
} from "./contracts.ts";
import { copyDocument } from "./document-copy.ts";

export class InMemoryDocumentStorage implements DocumentStorage {
  readonly #documents = new Map<string, StoredDocument>();

  async create(
    document: StoredDocument,
  ): Promise<DocumentStorageCreateResult> {
    if (this.#documents.has(document.id)) {
      return "duplicate";
    }
    this.#documents.set(document.id, copyDocument(document));
    return "created";
  }

  async get(id: string): Promise<StoredDocument | null> {
    const document = this.#documents.get(id);
    return document === undefined ? null : copyDocument(document);
  }
}
