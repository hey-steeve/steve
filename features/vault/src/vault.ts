import {
  factualSummaryRules,
  vaultLimits,
  type DocumentSummary,
  type StoredDocument,
  type Vault,
  type VaultDependencies,
  type VaultDocumentInput,
  type VaultError,
  type VaultResult,
} from "./contracts.ts";
import { digestContent } from "./content-digest.ts";
import { copyDocument, copyListItem, copySummary } from "./document-copy.ts";
import { extractDocumentText } from "./document-text.ts";
import {
  validateDocumentInput,
  validateDocumentList,
  validateLookupId,
  validateStoredDocument,
  validateSummaryOutput,
} from "./validation.ts";

function failure<T>(
  code: VaultError["code"],
  message: string,
): VaultResult<T> {
  return { ok: false, error: { code, message } };
}

function timestamp(now: () => Date): string | null {
  try {
    const value = now();
    return Number.isNaN(value.valueOf()) ? null : value.toISOString();
  } catch {
    return null;
  }
}

export function createVault(dependencies: VaultDependencies): Vault {
  const storage = dependencies.storage;
  const summarizer = dependencies.summarizer;
  const generateId =
    dependencies.generateId ?? (() => `doc_${globalThis.crypto.randomUUID()}`);
  const now = dependencies.now ?? (() => new Date());
  const summaryCache = new Map<
    string,
    { readonly contentDigest: string; readonly summary: DocumentSummary }
  >();
  const inFlightSummaries = new Map<
    string,
    {
      readonly contentDigest: string;
      readonly promise: Promise<VaultResult<DocumentSummary>>;
    }
  >();
  const documentVersions = new Map<string, number>();

  function documentVersion(id: string): number {
    return documentVersions.get(id) ?? 0;
  }

  function advanceDocumentVersion(id: string): void {
    documentVersions.set(id, documentVersion(id) + 1);
    summaryCache.delete(id);
  }

  async function load(id: string): Promise<VaultResult<{
    readonly document: StoredDocument;
    readonly text: string;
  }>> {
    const validId = validateLookupId(id);
    if (!validId.ok) {
      return validId;
    }

    let stored: StoredDocument | null;
    try {
      stored = await storage.get(validId.value);
    } catch {
      return failure("STORAGE_FAILURE", "Document storage failed.");
    }
    if (stored === null) {
      return failure("DOCUMENT_NOT_FOUND", "Document was not found.");
    }
    let validated: ReturnType<typeof validateStoredDocument>;
    try {
      validated = validateStoredDocument(stored);
    } catch {
      return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
    }
    if (!validated.ok || validated.value.document.id !== validId.value) {
      return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
    }
    const digest = await digestContent(validated.value.document.content);
    if (digest === null) {
      return failure("DEPENDENCY_FAILURE", "Document integrity check failed.");
    }
    if (digest !== validated.value.document.contentDigest) {
      return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
    }
    let text = validated.value.text;
    if (text === null) {
      const extracted = await extractDocumentText(validated.value.document);
      if (!extracted.ok) {
        return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
      }
      text = extracted.value;
    }
    return {
      ok: true,
      value: { document: validated.value.document, text },
    };
  }

  async function generateSummary(
    document: StoredDocument,
    text: string,
    version: number,
  ): Promise<VaultResult<DocumentSummary>> {
    let output: unknown;
    try {
      output = await summarizer.summarize({
        document: {
          id: document.id,
          fileName: document.fileName,
          mimeType: document.mimeType,
          text,
        },
        rules: factualSummaryRules,
      });
    } catch {
      return failure("SUMMARIZATION_FAILURE", "Document summarization failed.");
    }
    let validated: ReturnType<typeof validateSummaryOutput>;
    try {
      validated = validateSummaryOutput(output, text);
    } catch {
      return failure(
        "INVALID_SUMMARY",
        "Summary provider returned an invalid result.",
      );
    }
    if (!validated.ok) {
      return validated;
    }
    const generatedAt = timestamp(now);
    if (generatedAt === null) {
      return failure("DEPENDENCY_FAILURE", "Document clock failed.");
    }
    const summary: DocumentSummary = {
      documentId: document.id,
      assertions: validated.value.assertions.map((assertion) => ({
        text: assertion.text,
        evidence: [...assertion.evidence],
      })),
      generatedAt,
    };
    if (documentVersion(document.id) === version) {
      summaryCache.set(document.id, {
        contentDigest: document.contentDigest,
        summary: copySummary(summary),
      });
    }
    return { ok: true, value: copySummary(summary) };
  }

  return {
    async store(input: VaultDocumentInput): Promise<VaultResult<StoredDocument>> {
      const storedAt = timestamp(now);
      if (storedAt === null) {
        return failure("DEPENDENCY_FAILURE", "Document clock failed.");
      }
      let validated: ReturnType<typeof validateDocumentInput>;
      try {
        validated = validateDocumentInput(input, generateId, storedAt);
      } catch {
        return failure("INVALID_DOCUMENT", "Document input is invalid.");
      }
      if (!validated.ok) {
        return validated;
      }

      const contentDigest = await digestContent(
        validated.value.document.content,
      );
      if (contentDigest === null) {
        return failure("DEPENDENCY_FAILURE", "Document integrity check failed.");
      }
      const document: StoredDocument = {
        ...validated.value.document,
        contentDigest,
      };
      if (validated.value.text === null) {
        const extracted = await extractDocumentText(document);
        if (!extracted.ok) {
          return extracted;
        }
      }

      let outcome: "created" | "duplicate" | "duplicate-content";
      try {
        outcome = await storage.create(copyDocument(document));
      } catch {
        return failure("STORAGE_FAILURE", "Document storage failed.");
      }
      if (outcome === "duplicate") {
        return failure(
          "DUPLICATE_DOCUMENT",
          "A document with this identifier already exists.",
        );
      }
      if (outcome === "duplicate-content") {
        return failure(
          "DUPLICATE_CONTENT",
          "This document content is already stored.",
        );
      }
      if (outcome !== "created") {
        return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
      }
      advanceDocumentVersion(document.id);
      return { ok: true, value: copyDocument(document) };
    },

    async get(id: string): Promise<VaultResult<StoredDocument>> {
      const result = await load(id);
      if (!result.ok) {
        return result;
      }
      return { ok: true, value: copyDocument(result.value.document) };
    },

    async list() {
      let output: unknown;
      try {
        output = await storage.list(vaultLimits.listedDocuments);
      } catch {
        return failure("STORAGE_FAILURE", "Document storage failed.");
      }
      let validated: ReturnType<typeof validateDocumentList>;
      try {
        validated = validateDocumentList(output);
      } catch {
        return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
      }
      if (!validated.ok) {
        return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
      }
      return {
        ok: true,
        value: [...validated.value]
          .sort((left, right) => (
            right.storedAt.localeCompare(left.storedAt) ||
            left.id.localeCompare(right.id)
          ))
          .map((document) => copyListItem(document)),
      };
    },

    async delete(id: string) {
      const validId = validateLookupId(id);
      if (!validId.ok) {
        return validId;
      }
      let outcome: unknown;
      try {
        outcome = await storage.delete(validId.value);
      } catch {
        return failure("STORAGE_FAILURE", "Document storage failed.");
      }
      if (outcome === "not-found") {
        return failure("DOCUMENT_NOT_FOUND", "Document was not found.");
      }
      if (outcome !== "deleted") {
        return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
      }
      advanceDocumentVersion(validId.value);
      return { ok: true, value: { id: validId.value } };
    },

    async summarize(id: string): Promise<VaultResult<DocumentSummary>> {
      const result = await load(id);
      if (!result.ok) {
        return result;
      }
      const cached = summaryCache.get(result.value.document.id);
      if (cached?.contentDigest === result.value.document.contentDigest) {
        return { ok: true, value: copySummary(cached.summary) };
      }
      const inFlight = inFlightSummaries.get(result.value.document.id);
      if (inFlight?.contentDigest === result.value.document.contentDigest) {
        const sharedResult = await inFlight.promise;
        return sharedResult.ok
          ? { ok: true, value: copySummary(sharedResult.value) }
          : sharedResult;
      }
      const generation = generateSummary(
        result.value.document,
        result.value.text,
        documentVersion(result.value.document.id),
      );
      inFlightSummaries.set(result.value.document.id, {
        contentDigest: result.value.document.contentDigest,
        promise: generation,
      });
      try {
        const generated = await generation;
        return generated.ok
          ? { ok: true, value: copySummary(generated.value) }
          : generated;
      } finally {
        if (
          inFlightSummaries.get(result.value.document.id)?.promise === generation
        ) {
          inFlightSummaries.delete(result.value.document.id);
        }
      }
    },
  };
}
