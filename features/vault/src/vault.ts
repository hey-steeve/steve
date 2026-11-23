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

function needsGeneratedId(input: unknown): boolean | null {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return true;
    }
    return Reflect.get(input, "id") === undefined;
  } catch {
    return null;
  }
}

export function createVault(dependencies: VaultDependencies): Vault {
  const storage = dependencies.storage;
  const summarizer = dependencies.summarizer;
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
    if (!validated.ok) {
      return failure("STORAGE_FAILURE", "Document storage returned invalid data.");
    }
    return validated;
  }

  return {
    async store(input: VaultDocumentInput): Promise<VaultResult<StoredDocument>> {
      let generatedId = "";
      const generateDocumentId = needsGeneratedId(input);
      if (generateDocumentId === null) {
        return failure("INVALID_DOCUMENT", "Document input is invalid.");
      }
      if (generateDocumentId) {
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
      let validated: ReturnType<typeof validateDocumentInput>;
      try {
        validated = validateDocumentInput(input, generatedId, storedAt);
      } catch {
        return failure("INVALID_DOCUMENT", "Document input is invalid.");
      }
      if (!validated.ok) {
        return validated;
      }

      let outcome: "created" | "duplicate";
      try {
        outcome = await storage.create(
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
        output = await summarizer.summarize({
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
      let validated: ReturnType<typeof validateSummaryOutput>;
      try {
        validated = validateSummaryOutput(output, result.value.text);
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
      return {
        ok: true,
        value: {
          documentId: result.value.document.id,
          assertions: validated.value.assertions.map((assertion) => ({
            text: assertion.text,
            evidence: [...assertion.evidence],
          })),
          generatedAt,
        },
      };
    },
  };
}
