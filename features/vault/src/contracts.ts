export const supportedDocumentMimeTypes = Object.freeze([
  "text/plain",
  "text/markdown",
] as const);

export type SupportedDocumentMimeType =
  (typeof supportedDocumentMimeTypes)[number];

export const vaultLimits = Object.freeze({
  documentIdCharacters: 64,
  fileNameCharacters: 255,
  contentBytes: 1_048_576,
  metadataTitleCharacters: 200,
  metadataSourceCharacters: 100,
  summaryAssertions: 8,
  assertionCharacters: 500,
  evidencePerAssertion: 4,
  evidenceCharacters: 500,
} as const);

export type VaultDocumentMetadataInput = {
  readonly title?: string;
  readonly source?: string;
  readonly documentDate?: string;
};

export type VaultDocumentInput = {
  readonly id?: string;
  readonly fileName: string;
  readonly mimeType: SupportedDocumentMimeType;
  readonly content: Uint8Array;
  readonly metadata?: VaultDocumentMetadataInput;
};

export type VaultDocumentMetadata = {
  readonly title?: string;
  readonly source?: string;
  readonly documentDate?: string;
};

export type StoredDocument = {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: SupportedDocumentMimeType;
  readonly sizeBytes: number;
  readonly content: Uint8Array;
  readonly metadata: VaultDocumentMetadata;
  readonly storedAt: string;
};

export type DocumentStorageCreateResult = "created" | "duplicate";

export interface DocumentStorage {
  create(document: StoredDocument): Promise<DocumentStorageCreateResult>;
  get(id: string): Promise<StoredDocument | null>;
}

export const factualSummaryRules = Object.freeze({
  factsOnly: true,
  noMedicalInterpretation: true,
  noDiagnosis: true,
  noPrescription: true,
} as const);

export type FactualSummaryRequest = {
  readonly document: {
    readonly id: string;
    readonly fileName: string;
    readonly mimeType: SupportedDocumentMimeType;
    readonly text: string;
  };
  readonly rules: typeof factualSummaryRules;
};

export interface FactualSummaryProvider {
  summarize(request: FactualSummaryRequest): Promise<unknown>;
}

export type FactualAssertion = {
  readonly text: string;
  readonly evidence: readonly string[];
};

export type FactualSummaryCandidate = {
  readonly assertions: readonly FactualAssertion[];
};

export type DocumentSummary = {
  readonly documentId: string;
  readonly assertions: readonly FactualAssertion[];
  readonly generatedAt: string;
};

export type VaultErrorCode =
  | "INVALID_DOCUMENT"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "CONTENT_TOO_LARGE"
  | "DUPLICATE_DOCUMENT"
  | "DOCUMENT_NOT_FOUND"
  | "STORAGE_FAILURE"
  | "SUMMARIZATION_FAILURE"
  | "INVALID_SUMMARY"
  | "DEPENDENCY_FAILURE";

export type VaultError = {
  readonly code: VaultErrorCode;
  readonly message: string;
  readonly field?: string;
};

export type VaultResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: VaultError };

export type VaultDependencies = {
  readonly storage: DocumentStorage;
  readonly summarizer: FactualSummaryProvider;
  readonly generateId?: () => string;
  readonly now?: () => Date;
};

export interface Vault {
  store(input: VaultDocumentInput): Promise<VaultResult<StoredDocument>>;
  get(id: string): Promise<VaultResult<StoredDocument>>;
  summarize(id: string): Promise<VaultResult<DocumentSummary>>;
}
