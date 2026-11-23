import {
  supportedDocumentMimeTypes,
  vaultLimits,
  type FactualAssertion,
  type StoredDocument,
  type SupportedDocumentMimeType,
  type VaultDocumentInput,
  type VaultDocumentMetadata,
  type VaultError,
  type VaultResult,
} from "./contracts.ts";

const documentIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const fileControlCharacterPattern = /[\u0000-\u001f\u007f]/;

type ValidatedDocument = {
  readonly document: StoredDocument;
  readonly text: string;
};

type ValidatedSummary = {
  readonly assertions: readonly FactualAssertion[];
};

function failure(
  code: VaultError["code"],
  message: string,
  field?: string,
): VaultResult<never> {
  const error = field === undefined ? { code, message } : { code, message, field };
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSupportedMimeType(
  value: unknown,
): value is SupportedDocumentMimeType {
  return (
    typeof value === "string" &&
    supportedDocumentMimeTypes.some((mimeType) => mimeType === value)
  );
}

function validDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= vaultLimits.documentIdCharacters &&
    documentIdPattern.test(value)
  );
}

function validFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= vaultLimits.fileNameCharacters &&
    value === value.trim() &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !fileControlCharacterPattern.test(value)
  );
}

function validBoundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim() &&
    !controlCharacterPattern.test(value)
  );
}

function validCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value;
}

function validateMetadata(
  value: unknown,
): VaultResult<VaultDocumentMetadata> {
  if (value === undefined) {
    return { ok: true, value: {} };
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["title", "source", "documentDate"])
  ) {
    return failure(
      "INVALID_DOCUMENT",
      "Document metadata is invalid.",
      "metadata",
    );
  }

  const metadata: {
    title?: string;
    source?: string;
    documentDate?: string;
  } = {};
  if (value["title"] !== undefined) {
    if (
      !validBoundedText(value["title"], vaultLimits.metadataTitleCharacters)
    ) {
      return failure(
        "INVALID_DOCUMENT",
        "Document metadata is invalid.",
        "metadata.title",
      );
    }
    metadata.title = value["title"];
  }
  if (value["source"] !== undefined) {
    if (
      !validBoundedText(value["source"], vaultLimits.metadataSourceCharacters)
    ) {
      return failure(
        "INVALID_DOCUMENT",
        "Document metadata is invalid.",
        "metadata.source",
      );
    }
    metadata.source = value["source"];
  }
  if (value["documentDate"] !== undefined) {
    if (!validCalendarDate(value["documentDate"])) {
      return failure(
        "INVALID_DOCUMENT",
        "Document metadata is invalid.",
        "metadata.documentDate",
      );
    }
    metadata.documentDate = value["documentDate"];
  }
  return { ok: true, value: metadata };
}

function decodeText(content: Uint8Array): VaultResult<string> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return failure(
      "INVALID_DOCUMENT",
      "Document content must be valid UTF-8 text.",
      "content",
    );
  }
  if (text.trim() === "" || text.includes("\u0000")) {
    return failure(
      "INVALID_DOCUMENT",
      "Document content must contain text.",
      "content",
    );
  }
  return { ok: true, value: text };
}

export function validateDocumentInput(
  input: VaultDocumentInput,
  generatedId: string,
  storedAt: string,
): VaultResult<ValidatedDocument> {
  const value: unknown = input;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "fileName", "mimeType", "content", "metadata"])
  ) {
    return failure("INVALID_DOCUMENT", "Document input is invalid.");
  }

  const id = value["id"] === undefined ? generatedId : value["id"];
  if (!validDocumentId(id)) {
    return failure(
      "INVALID_DOCUMENT",
      "Document identifier is invalid.",
      "id",
    );
  }
  if (!validFileName(value["fileName"])) {
    return failure(
      "INVALID_DOCUMENT",
      "Document filename is invalid.",
      "fileName",
    );
  }
  if (!isSupportedMimeType(value["mimeType"])) {
    return failure(
      "UNSUPPORTED_CONTENT_TYPE",
      "Document content type is not supported.",
      "mimeType",
    );
  }
  if (!(value["content"] instanceof Uint8Array)) {
    return failure(
      "INVALID_DOCUMENT",
      "Document content must be bytes.",
      "content",
    );
  }
  if (value["content"].byteLength > vaultLimits.contentBytes) {
    return failure(
      "CONTENT_TOO_LARGE",
      "Document content exceeds the size limit.",
      "content",
    );
  }

  const text = decodeText(value["content"]);
  if (!text.ok) {
    return text;
  }
  const metadata = validateMetadata(value["metadata"]);
  if (!metadata.ok) {
    return metadata;
  }

  return {
    ok: true,
    value: {
      document: {
        id,
        fileName: value["fileName"],
        mimeType: value["mimeType"],
        sizeBytes: value["content"].byteLength,
        content: new Uint8Array(value["content"]),
        metadata: metadata.value,
        storedAt,
      },
      text: text.value,
    },
  };
}

export function validateStoredDocument(
  input: unknown,
): VaultResult<ValidatedDocument> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      "id",
      "fileName",
      "mimeType",
      "sizeBytes",
      "content",
      "metadata",
      "storedAt",
    ]) ||
    !validDocumentId(input["id"]) ||
    !validFileName(input["fileName"]) ||
    !isSupportedMimeType(input["mimeType"]) ||
    !(input["content"] instanceof Uint8Array) ||
    typeof input["sizeBytes"] !== "number" ||
    !Number.isInteger(input["sizeBytes"]) ||
    input["sizeBytes"] !== input["content"].byteLength ||
    input["sizeBytes"] > vaultLimits.contentBytes ||
    !validTimestamp(input["storedAt"])
  ) {
    return failure("INVALID_DOCUMENT", "Stored document is invalid.");
  }

  const text = decodeText(input["content"]);
  if (!text.ok) {
    return text;
  }
  const metadata = validateMetadata(input["metadata"]);
  if (!metadata.ok) {
    return metadata;
  }
  return {
    ok: true,
    value: {
      document: {
        id: input["id"],
        fileName: input["fileName"],
        mimeType: input["mimeType"],
        sizeBytes: input["sizeBytes"],
        content: new Uint8Array(input["content"]),
        metadata: metadata.value,
        storedAt: input["storedAt"],
      },
      text: text.value,
    },
  };
}

export function validateLookupId(id: string): VaultResult<string> {
  if (!validDocumentId(id)) {
    return failure(
      "INVALID_DOCUMENT",
      "Document identifier is invalid.",
      "id",
    );
  }
  return { ok: true, value: id };
}

export function validateSummaryOutput(
  output: unknown,
  sourceText: string,
): VaultResult<ValidatedSummary> {
  if (
    !isRecord(output) ||
    !hasOnlyKeys(output, ["assertions"]) ||
    !Array.isArray(output["assertions"]) ||
    output["assertions"].length === 0 ||
    output["assertions"].length > vaultLimits.summaryAssertions
  ) {
    return failure(
      "INVALID_SUMMARY",
      "Summary provider returned an invalid result.",
    );
  }

  const assertions: FactualAssertion[] = [];
  const assertionTexts = new Set<string>();
  const allEvidence = new Set<string>();
  for (const item of output["assertions"]) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ["text", "evidence"]) ||
      !validBoundedText(item["text"], vaultLimits.assertionCharacters) ||
      assertionTexts.has(item["text"]) ||
      !Array.isArray(item["evidence"]) ||
      item["evidence"].length === 0 ||
      item["evidence"].length > vaultLimits.evidencePerAssertion
    ) {
      return failure(
        "INVALID_SUMMARY",
        "Summary provider returned an invalid result.",
      );
    }
    const evidence: string[] = [];
    for (const excerpt of item["evidence"]) {
      if (
        !validBoundedText(excerpt, vaultLimits.evidenceCharacters) ||
        !sourceText.includes(excerpt) ||
        allEvidence.has(excerpt)
      ) {
        return failure(
          "INVALID_SUMMARY",
          "Summary provider returned an invalid result.",
        );
      }
      evidence.push(excerpt);
      allEvidence.add(excerpt);
    }
    assertionTexts.add(item["text"]);
    assertions.push({ text: item["text"], evidence });
  }
  return {
    ok: true,
    value: { assertions },
  };
}
