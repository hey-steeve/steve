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
      summary: "The note requests a blood test before the next appointment.",
      evidence: [
        "A blood test is requested before the next appointment.",
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

`store`, `get`, and `summarize` return `VaultResult<T>`, a discriminated result:

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
- document, metadata, result, error, and summary contracts;
- `DocumentStorage` and `FactualSummaryProvider` adapter boundaries;
- `InMemoryDocumentStorage` for tests and local integration;
- supported MIME types, validation limits, and factual summary rules.

## Document validation

The core currently accepts UTF-8 `text/plain` and `text/markdown` documents.
It rejects:

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
return `created` or `duplicate`; the in-memory adapter provides this behavior.
There is no update operation, so duplicate identifiers cannot silently replace
stored state. Stored bytes and metadata are copied on write and on read.

Storage adapters are treated as an external boundary. Retrieved records are
validated again, including byte length, timestamp, metadata, content type, and
UTF-8 content.

## Factual summaries

The summarizer receives decoded text plus these immutable rules:

- facts only;
- no medical interpretation;
- no diagnosis;
- no prescription.

Provider output is untrusted. Vault requires an exact object containing a
bounded, non-empty `summary` and one to eight unique evidence excerpts. Every
evidence excerpt must occur verbatim in the source document. Invalid output is
rejected as `INVALID_SUMMARY`.

Evidence validation gives callers an auditable source anchor. It cannot prove
that every free-form sentence is semantically faithful. A production provider
must enforce the factual-summary contract as well; it must not infer a
condition, urgency, diagnosis, medication change, or treatment.

## Errors and content safety

Errors have stable codes and generic messages. Exceptions from storage, the
summary provider, the identifier generator, and the clock are converted to
explicit failures. Exception details and document contents are not copied into
Vault errors.

Vault does not log document contents. The repository does not yet expose the
planned shared logger, so this package performs no logging.

## Dependencies

The feature imports no other feature and currently needs no runtime package.
Its contracts remain local because there is no confirmed cross-feature
consumer contract.

## Current limitations

- The in-memory adapter is process-local and non-persistent.
- Only UTF-8 text and Markdown are supported.
- PDF parsing, OCR, binary documents, object storage, metadata persistence,
  encryption, access control, and retention policies are not implemented.
- There is no owner or tenant scope yet because the repository has no shared
  identity contract. A production integration must add authorization and
  tenant isolation at its owning boundary before storing real documents.
- Summaries are generated on demand and are not cached or persisted.
- There is no Inbox or app integration and no live LLM adapter.
- The feature contains synthetic fixtures only and is not ready for real
  patient data.

## Check

```bash
pnpm --filter @steve/vault test
pnpm --filter @steve/vault typecheck
```
