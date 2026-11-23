import { randomUUID } from "node:crypto";
import {
  factualSummaryRules,
  type DocumentSummary,
  type StoredDocument,
  type Vault,
  type VaultDependencies,
  type VaultDocumentInput,
  type VaultError,
  type VaultResult,
} from "./contracts.ts";
import { copyDocument } from "./document-copy.ts";
import {
  validateDocumentInput,
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
  const generateId = dependencies.generateId ?? (() => `doc_${randomUUID()}`);
  const now = dependencies.now ?? (() => new Date());

  async function load(
    id: string,
  ): Promise<VaultResult<{ document: StoredDocument; text: string }>> {
    const validId = validateLookupId(id);
    if (!validId.ok) {
      return validId;
    }

    let stored: StoredDocument | null;
    try {
      stored = await dependencies.storage.get(validId.value);
    } catch {
      return failure("STORAGE_FAILURE", "Document storage failed.");
    }
    if (stored === null) {
      return failure("DOCUMENT_NOT_FOUND", "Document was not found.");
    }
    const validated = validateStoredDocument(stored);
    if (!validated.ok) {
      return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
    }
    return validated;
  }

  return {
    async store(input: VaultDocumentInput): Promise<VaultResult<StoredDocument>> {
      let generatedId = "";
      const inputId = (input as VaultDocumentInput | null)?.id;
      if (inputId === undefined) {
        try {
          generatedId = generateId();
        } catch {
          return failure("DEPENDENCY_FAILURE", "Document identifier generation failed.");
        }
      }
      const storedAt = timestamp(now);
      if (storedAt === null) {
        return failure("DEPENDENCY_FAILURE", "Document clock failed.");
      }
      const validated = validateDocumentInput(input, generatedId, storedAt);
      if (!validated.ok) {
        return validated;
      }

      let outcome: "created" | "duplicate";
      try {
        outcome = await dependencies.storage.create(
          copyDocument(validated.value.document),
        );
      } catch {
        return failure("STORAGE_FAILURE", "Document storage failed.");
      }
      if (outcome === "duplicate") {
        return failure(
          "DUPLICATE_DOCUMENT",
          "A document with this identifier already exists.",
        );
      }
      if (outcome !== "created") {
        return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
      }
      return { ok: true, value: copyDocument(validated.value.document) };
    },

    async get(id: string): Promise<VaultResult<StoredDocument>> {
      const result = await load(id);
      if (!result.ok) {
        return result;
      }
      return { ok: true, value: copyDocument(result.value.document) };
    },

    async summarize(id: string): Promise<VaultResult<DocumentSummary>> {
      const result = await load(id);
      if (!result.ok) {
        return result;
      }

      let output: unknown;
      try {
        output = await dependencies.summarizer.summarize({
          document: {
            id: result.value.document.id,
            fileName: result.value.document.fileName,
            mimeType: result.value.document.mimeType,
            text: result.value.text,
          },
          rules: factualSummaryRules,
        });
      } catch {
        return failure("SUMMARIZATION_FAILURE", "Document summarization failed.");
      }
      const validated = validateSummaryOutput(output, result.value.text);
      if (!validated.ok) {
        return validated;
      }
      const generatedAt = timestamp(now);
      if (generatedAt === null) {
        return failure("DEPENDENCY_FAILURE", "Document clock failed.");
      }
      return {
        ok: true,
        value: {
          documentId: result.value.document.id,
          summary: validated.value.summary,
          evidence: [...validated.value.evidence],
          generatedAt,
        },
      };
    },
  };
}
