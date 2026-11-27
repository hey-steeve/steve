# vault

## Role

`@steve/vault` stores, retrieves, and factually summarizes documents. It does
not interpret document contents medically.

The current milestone is a reusable core. It has no app integration and uses
no live external service.

## Public API

Create a Vault with explicit storage and summary boundaries:

```ts
import {
  InMemoryDocumentStorage,
  createVault,
  type FactualSummaryProvider,
} from "@steve/vault";

const summarizer: FactualSummaryProvider = {
  async summarize(request) {
    // A production adapter must follow request.rules. This deterministic
    // example only uses text that is explicitly present in the document.
    return {
      assertions: [
        {
          text: "The note requests a blood test before the next appointment.",
          evidence: [
            "A blood test is requested before the next appointment.",
          ],
        },
      ],
    };
  },
};

const vault = createVault({
  storage: new InMemoryDocumentStorage(),
  summarizer,
});

const stored = await vault.store({
  fileName: "consultation-note.txt",
  mimeType: "text/plain",
  content: new TextEncoder().encode(
    "Consultation on 12 November. A blood test is requested before the next appointment.",
  ),
  metadata: {
    title: "Consultation note",
    source: "synthetic fixture",
    documentDate: "2026-11-12",
  },
});
```

`store`, `get`, `list`, `delete`, and `summarize` return `VaultResult<T>`, a
discriminated result:

```ts
type VaultResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: VaultError };
```

Callers can provide a stable document identifier. When they do not,
`createVault` assigns one. The identifier generator and clock can be injected
for deterministic tests.

The package entry point exports:

- `createVault` and the `Vault` interface;
- document, list item, metadata, result, error, `FactualAssertion`,
  `FactualSummaryCandidate`, and summary contracts;
- `DocumentStorage` and `FactualSummaryProvider` adapter boundaries;
- `InMemoryDocumentStorage` for tests and local integration;
- supported MIME types, validation limits, and factual summary rules.

## Document ingestion and validation

The core accepts UTF-8 `text/plain`, UTF-8 `text/markdown`, and
`application/pdf` documents. PDF.js extracts text from local bytes only. Vault
does not render pages, load a remote document URL, enable XFA, or perform OCR.

PDF ingestion is bounded to 1 MiB of source bytes, 50 pages, 100,000 extracted
characters, 1.5 seconds of processing after the worker is ready, and a
resource-limited worker thread. After loading PDF.js and validating its startup
data, the worker sends a `ready` message. The parent arms the processing budget
and replies with `start` before parsing begins. Worker startup has a separate
5-second guard, so module loading cannot consume the document processing
budget. A PDF is accepted only when it parses successfully and contains
extractable text.
Corrupt, encrypted, empty, image-only, decompression-heavy, timed-out, and
over-limit PDFs are rejected before storage. Extracted text is stored with the
document after successful ingestion, so `get()` and `summarize()` never parse
the PDF again.

At most two PDF extraction workers run concurrently in one process. Additional
PDF stores fail fast with `PROCESSING_BUSY`; Vault does not retain an unbounded
queue of document bytes. A worker slot is released only after the worker has
terminated following success, validation failure, timeout, or worker error. A
startup failure before a worker exists releases its slot immediately. Text and
Markdown do not consume PDF worker capacity.

Vault also rejects:

- unknown input and metadata fields;
- missing, empty, malformed, NUL-containing, or non-UTF-8 content;
- content larger than 1 MiB;
- unsupported or parameterized MIME types;
- invalid identifiers;
- blank, oversized, or path-like filenames, including `/`, `\`, `.` and
  `..` forms;
- invalid or oversized metadata;
- invalid calendar dates.

Filenames are metadata only. Vault never treats them as filesystem paths.

`DocumentStorage.create` is a create-if-absent operation. It must atomically
return `created`, `duplicate`, or `duplicate-content`; the in-memory adapter
provides this behavior. There is no update operation, so duplicate identifiers
cannot silently replace stored state. Stored bytes and metadata are copied on
write and on read.

Vault computes a lowercase SHA-256 digest from the snapshotted content before
storage. The in-memory adapter uses it to reject identical content under a
different identifier. Retrieval recomputes the digest and rejects a record if
its bytes no longer match its stored digest. The digest provides integrity and
deduplication; it is not encryption and must not be treated as an access
control. The current adapter is single-user. When owner or tenant identity is
introduced, both the digest index and `DUPLICATE_CONTENT` result must be scoped
to that owner or tenant; global deduplication must not reveal whether another
user has stored the same bytes.

## Document library

`list()` returns document metadata in newest-first order. List items include
the identifier, filename, MIME type, byte size, content digest, metadata, and
storage timestamp, but never document bytes. The result is capped at 500 items
and every adapter value is snapshotted and validated before it is returned.

`delete(id)` removes one document and invalidates its cached summary. It returns
`DOCUMENT_NOT_FOUND` when the identifier is absent. Deleting a document also
releases its digest in the in-memory adapter, so the same content can be stored
again deliberately. There is no update or restore operation.

Storage adapters are treated as an external boundary. Retrieved records are
validated again, including byte length, timestamp, metadata, content type,
persisted extracted text, and UTF-8 content.

## Factual summaries

The summarizer receives decoded text plus these immutable rules:

- facts only;
- no medical interpretation;
- no diagnosis;
- no prescription.

Provider output is untrusted. Vault requires an exact object containing one to
eight assertions. Each assertion contains:

- non-empty factual text, bounded to 500 characters;
- one to four evidence excerpts;
- evidence excerpts with at least 8 characters after trimming and at least one
  letter or digit;
- evidence excerpts bounded to 500 characters each.

Every evidence excerpt must occur verbatim in the source document. Assertions
and evidence excerpts must be unique across the result. Invalid output is
rejected as `INVALID_SUMMARY`. The returned `DocumentSummary` keeps every
assertion next to its evidence and contains no separate free-form summary.
Evidence excerpts may span multiple lines.

Summaries are anchored to source excerpts, not verified. Evidence-linked
assertions give callers an auditable source anchor and a display-ready
structure, but structural validation and the presence of an exact excerpt do
not prove that an assertion is semantically supported by that excerpt. App and
Inbox must never present these assertions as verified facts. A production
provider must enforce the factual-summary contract as well; it must not infer a
condition, urgency, diagnosis, medication change, or treatment.

Successful summaries are cached inside one Vault instance by document
identifier and content digest. Concurrent requests for the same document share
one in-flight provider call. Returned cached values are defensive copies, and
deletion prevents an in-flight result from being retained. Failures are never
cached. This cache is process-local and is not durable storage.

## Errors and content safety

Errors have stable codes and generic messages. Exceptions from storage, the
summary provider, the identifier generator, and the clock are converted to
explicit failures. Exception details and document contents are not copied into
Vault errors.

Hostile inputs and hostile values returned by storage or summary adapters are
contained at their runtime boundaries, including throwing getters, proxies,
properties, and iterators. They become `INVALID_DOCUMENT`, `STORAGE_FAILURE`,
or `INVALID_SUMMARY` results. An exception thrown by the summary operation
itself becomes `SUMMARIZATION_FAILURE`.

Vault snapshots untrusted fields, byte arrays, assertions, and evidence once,
then validates and returns only those snapshots. Custom iterators are ignored;
indexed array values are copied directly. A storage adapter must return the
same document identifier that Vault requested.

Vault does not log document contents. The repository does not yet expose the
planned shared logger, so this package performs no logging.

## Dependencies

The feature imports no other feature. It uses Mozilla's `pdfjs-dist` package to
parse local PDF bytes and extract text. Its contracts remain local because
there is no confirmed cross-feature consumer contract.

## Current limitations

- The in-memory adapter is process-local and non-persistent.
- PDF text extraction is supported, but OCR and arbitrary binary documents are
  not. Image-only and encrypted PDFs are rejected.
- Object storage, metadata persistence, encryption at rest, access control,
  retention policies, and restore are not implemented.
- There is no owner or tenant scope yet because the repository has no shared
  identity contract. A production integration must add authorization and
  tenant isolation at its owning boundary before storing real documents.
- Summaries are cached only in the current Vault process and are not persisted.
- Storage and summarizer adapters do not yet receive an abort signal. A future
  live adapter must add real cancellation rather than a timeout that leaves an
  operation running in the background.
- There is no Inbox or app integration and no live LLM adapter.
- The feature contains synthetic fixtures only and is not ready for real
  patient data.

## Check

```bash
pnpm --filter @steve/vault test
pnpm --filter @steve/vault typecheck
```
