import type {
  DocumentSummary,
  StoredDocument,
  VaultDocumentListItem,
} from "./contracts.ts";

export function copyDocument(document: StoredDocument): StoredDocument {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    content: new Uint8Array(document.content),
    contentDigest: document.contentDigest,
    metadata: { ...document.metadata },
    storedAt: document.storedAt,
  };
}

export function copyListItem(
  document: VaultDocumentListItem,
): VaultDocumentListItem {
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    contentDigest: document.contentDigest,
    metadata: { ...document.metadata },
    storedAt: document.storedAt,
  };
}

export function copySummary(summary: DocumentSummary): DocumentSummary {
  return {
    documentId: summary.documentId,
    assertions: summary.assertions.map((assertion) => ({
      text: assertion.text,
      evidence: [...assertion.evidence],
    })),
    generatedAt: summary.generatedAt,
  };
}
