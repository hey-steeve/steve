import type {
  DocumentStorage,
  DocumentStorageCreateResult,
  DocumentStorageDeleteResult,
  StoredDocument,
  VaultDocumentListItem,
} from "./contracts.ts";
import { copyDocument, copyListItem } from "./document-copy.ts";

export class InMemoryDocumentStorage implements DocumentStorage {
  readonly #documents = new Map<string, StoredDocument>();
  readonly #documentIdsByDigest = new Map<string, string>();

  async create(
    document: StoredDocument,
  ): Promise<DocumentStorageCreateResult> {
    if (this.#documents.has(document.id)) {
      return "duplicate";
    }
    if (this.#documentIdsByDigest.has(document.contentDigest)) {
      return "duplicate-content";
    }
    this.#documents.set(document.id, copyDocument(document));
    this.#documentIdsByDigest.set(document.contentDigest, document.id);
    return "created";
  }

  async get(id: string): Promise<StoredDocument | null> {
    const document = this.#documents.get(id);
    return document === undefined ? null : copyDocument(document);
  }

  async list(limit: number): Promise<readonly VaultDocumentListItem[]> {
    return [...this.#documents.values()]
      .sort((left, right) => (
        right.storedAt.localeCompare(left.storedAt) ||
        left.id.localeCompare(right.id)
      ))
      .slice(0, limit)
      .map((document) => copyListItem(document));
  }

  async delete(id: string): Promise<DocumentStorageDeleteResult> {
    const document = this.#documents.get(id);
    if (document === undefined) {
      return "not-found";
    }
    this.#documents.delete(id);
    this.#documentIdsByDigest.delete(document.contentDigest);
    return "deleted";
  }
}
