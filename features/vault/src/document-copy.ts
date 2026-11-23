import type { StoredDocument } from "./contracts.ts";

export function copyDocument(document: StoredDocument): StoredDocument {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    content: new Uint8Array(document.content),
    metadata: { ...document.metadata },
    storedAt: document.storedAt,
  };
}
