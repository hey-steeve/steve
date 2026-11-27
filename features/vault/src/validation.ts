import {
  supportedDocumentMimeTypes,
  vaultLimits,
  type FactualAssertion,
  type StoredDocument,
  type SupportedDocumentMimeType,
  type VaultDocumentMetadata,
  type VaultDocumentListItem,
  type VaultError,
  type VaultResult,
} from "./contracts.ts";

const documentIdPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const fileControlCharacterPattern = /[\u0000-\u001f\u007f]/;
const evidenceControlCharacterPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const letterOrDigitPattern = /[\p{L}\p{N}]/u;
const contentDigestPattern = /^[a-f0-9]{64}$/;

type UnhashedDocument = Omit<
  StoredDocument,
  "contentDigest" | "extractedText"
>;

type ValidatedDocumentInput = {
  readonly document: UnhashedDocument;
  readonly text: string | null;
};

type ValidatedStoredDocument = {
  readonly document: StoredDocument;
};

type ValidatedSummary = {
  readonly assertions: readonly FactualAssertion[];
};

type ByteSnapshot =
  | { readonly kind: "ok"; readonly value: Uint8Array }
  | { readonly kind: "invalid" }
  | { readonly kind: "too-large" };

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;

function failure(
  code: VaultError["code"],
  message: string,
  field?: string,
): VaultResult<never> {
  const error = field === undefined ? { code, message } : { code, message, field };
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function snapshotArray(
  value: unknown,
  maximum: number,
): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const length: unknown = Reflect.get(value, "length");
  if (
    typeof length !== "number" ||
    !Number.isInteger(length) ||
    length < 0 ||
    length > maximum
  ) {
    return null;
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      return null;
    }
    snapshot.push(Reflect.get(value, index));
  }
  return snapshot;
}

function snapshotBytes(value: unknown): ByteSnapshot {
  if (!(value instanceof Uint8Array) || byteLengthGetter === undefined) {
    return { kind: "invalid" };
  }
  let byteLength: unknown;
  try {
    byteLength = Reflect.apply(byteLengthGetter, value, []);
  } catch {
    return { kind: "invalid" };
  }
  if (
    typeof byteLength !== "number" ||
    !Number.isInteger(byteLength) ||
    byteLength < 0
  ) {
    return { kind: "invalid" };
  }
  if (byteLength > vaultLimits.contentBytes) {
    return { kind: "too-large" };
  }
  const snapshot = new Uint8Array(byteLength);
  try {
    Uint8Array.prototype.set.call(snapshot, value);
  } catch {
    return { kind: "invalid" };
  }
  return { kind: "ok", value: snapshot };
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

function snapshotEvidence(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const snapshot = value.trim();
  if (
    snapshot.length < vaultLimits.evidenceMinimumCharacters ||
    snapshot.length > vaultLimits.evidenceCharacters ||
    evidenceControlCharacterPattern.test(snapshot) ||
    !letterOrDigitPattern.test(snapshot)
  ) {
    return null;
  }
  return snapshot;
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
  const title: unknown = Reflect.get(value, "title");
  const source: unknown = Reflect.get(value, "source");
  const documentDate: unknown = Reflect.get(value, "documentDate");
  if (title !== undefined) {
    if (
      !validBoundedText(title, vaultLimits.metadataTitleCharacters)
    ) {
      return failure(
        "INVALID_DOCUMENT",
        "Document metadata is invalid.",
        "metadata.title",
      );
    }
    metadata.title = title;
  }
  if (source !== undefined) {
    if (
      !validBoundedText(source, vaultLimits.metadataSourceCharacters)
    ) {
      return failure(
        "INVALID_DOCUMENT",
        "Document metadata is invalid.",
        "metadata.source",
      );
    }
    metadata.source = source;
  }
  if (documentDate !== undefined) {
    if (!validCalendarDate(documentDate)) {
      return failure(
        "INVALID_DOCUMENT",
        "Document metadata is invalid.",
        "metadata.documentDate",
      );
    }
    metadata.documentDate = documentDate;
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

function hasPdfHeader(content: Uint8Array): boolean {
  return (
    content.byteLength >= 5 &&
    content[0] === 0x25 &&
    content[1] === 0x50 &&
    content[2] === 0x44 &&
    content[3] === 0x46 &&
    content[4] === 0x2d
  );
}

function validateDocumentText(
  mimeType: SupportedDocumentMimeType,
  content: Uint8Array,
): VaultResult<string | null> {
  if (mimeType === "application/pdf") {
    return hasPdfHeader(content)
      ? { ok: true, value: null }
      : failure(
        "INVALID_DOCUMENT",
        "Document content is not a valid PDF.",
        "content",
      );
  }
  return decodeText(content);
}

function validExtractedText(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() !== "" &&
    !value.includes("\u0000")
  );
}

export function validateDocumentInput(
  input: unknown,
  generateId: () => string,
  storedAt: string,
): VaultResult<ValidatedDocumentInput> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, ["id", "fileName", "mimeType", "content", "metadata"])
  ) {
    return failure("INVALID_DOCUMENT", "Document input is invalid.");
  }

  const inputId: unknown = Reflect.get(input, "id");
  const fileName: unknown = Reflect.get(input, "fileName");
  const mimeType: unknown = Reflect.get(input, "mimeType");
  const contentSnapshot = snapshotBytes(Reflect.get(input, "content"));
  const metadataInput: unknown = Reflect.get(input, "metadata");
  let id = inputId;
  if (id === undefined) {
    try {
      id = generateId();
    } catch {
      return failure(
        "DEPENDENCY_FAILURE",
        "Document identifier generation failed.",
      );
    }
  }
  if (!validDocumentId(id)) {
    return failure(
      "INVALID_DOCUMENT",
      "Document identifier is invalid.",
      "id",
    );
  }
  if (!validFileName(fileName)) {
    return failure(
      "INVALID_DOCUMENT",
      "Document filename is invalid.",
      "fileName",
    );
  }
  if (!isSupportedMimeType(mimeType)) {
    return failure(
      "UNSUPPORTED_CONTENT_TYPE",
      "Document content type is not supported.",
      "mimeType",
    );
  }
  if (contentSnapshot.kind === "invalid") {
    return failure(
      "INVALID_DOCUMENT",
      "Document content must be bytes.",
      "content",
    );
  }
  if (contentSnapshot.kind === "too-large") {
    return failure(
      "CONTENT_TOO_LARGE",
      "Document content exceeds the size limit.",
      "content",
    );
  }
  const content = contentSnapshot.value;

  const text = validateDocumentText(mimeType, content);
  if (!text.ok) {
    return text;
  }
  const metadata = validateMetadata(metadataInput);
  if (!metadata.ok) {
    return metadata;
  }

  return {
    ok: true,
    value: {
      document: {
        id,
        fileName,
        mimeType,
        sizeBytes: content.byteLength,
        content,
        metadata: metadata.value,
        storedAt,
      },
      text: text.value,
    },
  };
}

export function validateStoredDocument(
  input: unknown,
): VaultResult<ValidatedStoredDocument> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      "id",
      "fileName",
      "mimeType",
      "sizeBytes",
      "content",
      "extractedText",
      "contentDigest",
      "metadata",
      "storedAt",
    ])
  ) {
    return failure("INVALID_DOCUMENT", "Stored document is invalid.");
  }

  const id: unknown = Reflect.get(input, "id");
  const fileName: unknown = Reflect.get(input, "fileName");
  const mimeType: unknown = Reflect.get(input, "mimeType");
  const sizeBytes: unknown = Reflect.get(input, "sizeBytes");
  const contentSnapshot = snapshotBytes(Reflect.get(input, "content"));
  const extractedText: unknown = Reflect.get(input, "extractedText");
  const contentDigest: unknown = Reflect.get(input, "contentDigest");
  const metadataInput: unknown = Reflect.get(input, "metadata");
  const storedAt: unknown = Reflect.get(input, "storedAt");
  if (
    !validDocumentId(id) ||
    !validFileName(fileName) ||
    !isSupportedMimeType(mimeType) ||
    typeof sizeBytes !== "number" ||
    !Number.isInteger(sizeBytes) ||
    contentSnapshot.kind !== "ok" ||
    sizeBytes !== contentSnapshot.value.byteLength ||
    typeof contentDigest !== "string" ||
    !contentDigestPattern.test(contentDigest) ||
    !validTimestamp(storedAt)
  ) {
    return failure("INVALID_DOCUMENT", "Stored document is invalid.");
  }
  const content = contentSnapshot.value;

  const text = validateDocumentText(mimeType, content);
  if (!text.ok) {
    return text;
  }
  const textLimit = mimeType === "application/pdf"
    ? vaultLimits.extractedTextCharacters
    : vaultLimits.contentBytes;
  if (
    !validExtractedText(extractedText, textLimit) ||
    (text.value !== null && extractedText !== text.value)
  ) {
    return failure("INVALID_DOCUMENT", "Stored document is invalid.");
  }
  const metadata = validateMetadata(metadataInput);
  if (!metadata.ok) {
    return metadata;
  }
  return {
    ok: true,
    value: {
      document: {
        id,
        fileName,
        mimeType,
        sizeBytes,
        content,
        extractedText,
        contentDigest,
        metadata: metadata.value,
        storedAt,
      },
    },
  };
}

function validateListItem(input: unknown): VaultResult<VaultDocumentListItem> {
  if (
    !isRecord(input) ||
    !hasOnlyKeys(input, [
      "id",
      "fileName",
      "mimeType",
      "sizeBytes",
      "contentDigest",
      "metadata",
      "storedAt",
    ])
  ) {
    return failure("INVALID_DOCUMENT", "Stored document list is invalid.");
  }
  const id: unknown = Reflect.get(input, "id");
  const fileName: unknown = Reflect.get(input, "fileName");
  const mimeType: unknown = Reflect.get(input, "mimeType");
  const sizeBytes: unknown = Reflect.get(input, "sizeBytes");
  const contentDigest: unknown = Reflect.get(input, "contentDigest");
  const metadataInput: unknown = Reflect.get(input, "metadata");
  const storedAt: unknown = Reflect.get(input, "storedAt");
  if (
    !validDocumentId(id) ||
    !validFileName(fileName) ||
    !isSupportedMimeType(mimeType) ||
    typeof sizeBytes !== "number" ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > vaultLimits.contentBytes ||
    typeof contentDigest !== "string" ||
    !contentDigestPattern.test(contentDigest) ||
    !validTimestamp(storedAt)
  ) {
    return failure("INVALID_DOCUMENT", "Stored document list is invalid.");
  }
  const metadata = validateMetadata(metadataInput);
  if (!metadata.ok) {
    return failure("INVALID_DOCUMENT", "Stored document list is invalid.");
  }
  return {
    ok: true,
    value: {
      id,
      fileName,
      mimeType,
      sizeBytes,
      contentDigest,
      metadata: metadata.value,
      storedAt,
    },
  };
}

export function validateDocumentList(
  input: unknown,
): VaultResult<readonly VaultDocumentListItem[]> {
  const items = snapshotArray(input, vaultLimits.listedDocuments);
  if (items === null) {
    return failure("INVALID_DOCUMENT", "Stored document list is invalid.");
  }
  const documents: VaultDocumentListItem[] = [];
  const ids = new Set<string>();
  const digests = new Set<string>();
  for (const item of items) {
    const validated = validateListItem(item);
    if (
      !validated.ok ||
      ids.has(validated.value.id) ||
      digests.has(validated.value.contentDigest)
    ) {
      return failure("INVALID_DOCUMENT", "Stored document list is invalid.");
    }
    ids.add(validated.value.id);
    digests.add(validated.value.contentDigest);
    documents.push(validated.value);
  }
  return { ok: true, value: documents };
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
    !hasOnlyKeys(output, ["assertions"])
  ) {
    return failure(
      "INVALID_SUMMARY",
      "Summary provider returned an invalid result.",
    );
  }

  const assertionItems = snapshotArray(
    Reflect.get(output, "assertions"),
    vaultLimits.summaryAssertions,
  );
  if (assertionItems === null || assertionItems.length === 0) {
    return failure(
      "INVALID_SUMMARY",
      "Summary provider returned an invalid result.",
    );
  }

  const assertions: FactualAssertion[] = [];
  const assertionTexts = new Set<string>();
  const allEvidence = new Set<string>();
  for (const item of assertionItems) {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, ["text", "evidence"])
    ) {
      return failure(
        "INVALID_SUMMARY",
        "Summary provider returned an invalid result.",
      );
    }
    const text: unknown = Reflect.get(item, "text");
    const evidenceItems = snapshotArray(
      Reflect.get(item, "evidence"),
      vaultLimits.evidencePerAssertion,
    );
    if (
      !validBoundedText(text, vaultLimits.assertionCharacters) ||
      assertionTexts.has(text) ||
      evidenceItems === null ||
      evidenceItems.length === 0
    ) {
      return failure(
        "INVALID_SUMMARY",
        "Summary provider returned an invalid result.",
      );
    }
    const evidence: string[] = [];
    for (const item of evidenceItems) {
      const excerpt = snapshotEvidence(item);
      if (
        excerpt === null ||
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
    assertionTexts.add(text);
    assertions.push({ text, evidence });
  }
  return {
    ok: true,
    value: { assertions },
  };
}
