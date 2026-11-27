# inbox

## Role

`@steve/inbox` is the provider-independent email core for Steve. It validates
already normalized inbound messages, classifies appointment confirmations and
reports, returns typed events to an owning orchestrator, and sends authorized
documents through an injected mail gateway.

The current milestone is a reusable core. It has no app integration, real
email address, provider adapter, or persistent storage.

## Public API

Create an Inbox with explicit classifier, gateway, and storage boundaries:

```ts
import { InMemoryInboxStorage, createInbox } from "@steve/inbox";

const inbox = createInbox({
  classifier: {
    async classify(message) {
      // A production classifier must follow the same non-medical contract.
      const firstAttachment = message.attachments[0];
      return firstAttachment === undefined
        ? { type: "unsupported" }
        : { type: "report", attachmentIds: [firstAttachment.id] };
    },
  },
  mailGateway: {
    async send(request) {
      // A production adapter sends the validated snapshot and uses
      // request.requestId as its provider idempotency key.
      return {
        status: "sent",
        providerMessageId: "synthetic-provider-message",
        sentAt: "2026-11-27T10:00:00.000Z",
      };
    },
  },
  storage: new InMemoryInboxStorage(),
});
```

The package entry point exports:

- `createInbox` and the `Inbox` interface;
- normalized message, attachment, classifier, event, delivery, result, and
  error contracts;
- `InboundMessageClassifier`, `MailGateway`, and `InboxStorage` adapter
  boundaries;
- `InMemoryInboxStorage` for tests and local integration;
- `ScriptedMailGateway` for deterministic tests, demos, and local integration;
- `inboxLimits`, the validation and storage bounds.

## Normalized email boundary

`ingestMessage` receives a normalized message from a future provider adapter.
Inbox does not download messages and does not parse raw MIME. A normalized
message contains a stable provider identifier, sender, Steve recipient,
subject, optional text body, bounded attachments, and a timezone-aware receipt
timestamp.

All fields and byte arrays are copied before use. Email validation is
deliberately bounded and practical; it does not claim complete RFC 5322
support. Addresses are not trimmed or silently rewritten. Newlines and control
characters are rejected in email header fields to prevent header injection.
Filenames are metadata only and are never used as filesystem paths.

## Inbound classification and events

`InboundMessageClassifier.classify` receives a defensive snapshot. Its return
value is untrusted and is validated as one of these discriminated results:

- `appointment-confirmation`, with a non-empty reference and ordered,
  timezone-aware start and end timestamps;
- `report`, with one or more identifiers that match attachments actually
  present on the normalized message;
- `unsupported`.

Classifier output must not contain a diagnosis, prescription, medical
interpretation, or inferred clinical conclusion. Unknown, ambiguous, or
structurally invalid output becomes an `unsupported` result with reason
`invalid-classifier-output`. That terminal outcome is recorded for
idempotence. A classifier exception instead returns the generic
`CLASSIFICATION_FAILURE` error and is not recorded, so the same provider
message can be retried.

Inbox returns events; it never writes to Agenda, Vault, or Reminders:

- `appointment-confirmation-received` preserves email provenance and sets
  `requiresOwnerValidation: true`. A confirmation email is not itself an
  Agenda entry. The owning integration must validate and convert it.
- `document-received` preserves provenance, copies the referenced attachment,
  and marks it `verification: "unverified"`. A received document is not a
  verified medical fact and its contents are not interpreted.

The stable provider message identifier makes ingestion idempotent. The storage
performs create-if-absent recording, so only one concurrent caller returns the
events. Storage and classifier exception details are contained and are never
included in public errors.

## Authorized document delivery

`sendDocument` requires a stable request identifier, a valid practitioner
email address, a valid subject, at least one valid attachment, and exactly this
explicit signal from the owning orchestrator:

```ts
authorization: { authorized: true }
```

This signal is only a precondition at the Inbox boundary. It is not user
authentication, access control, consent proof, or practitioner verification.
A production owner must implement those controls before calling Inbox.

Inbox sends only through `MailGateway`. It passes a defensive snapshot and the
stable request identifier, validates the gateway response, contains provider
exceptions, and returns `sent` or `not-sent`. It never reports `sent` after a
gateway rejection, exception, or invalid response.

The storage reserves an outbound request before the gateway call. A completed
duplicate returns its recorded result without another gateway call; a
concurrent duplicate returns `REQUEST_IN_PROGRESS`. A live gateway must also
use `requestId` as its provider idempotency key because a provider may perform
the send before throwing or returning an invalid response. If the gateway
confirms delivery but recording that result fails, Inbox truthfully returns
`sent` with `tracking: "unavailable"` and leaves the reservation in place to
avoid an automatic duplicate send.

## Scripted document delivery

`ScriptedMailGateway` is an in-memory test adapter. It simulates deterministic
gateway responses without delivering an email or using a network request,
email provider, timer, or worker. Scenarios are keyed by the stable outbound
`requestId`, and each valid gateway call consumes at most one ordered step.

```ts
import { ScriptedMailGateway } from "@steve/inbox";

const mailGateway = new ScriptedMailGateway([
  {
    requestId: "synthetic-delivery-1",
    steps: [
      { type: "not-sent" },
      { type: "failure" },
      {
        type: "sent",
        providerMessageId: "synthetic-provider-message-1",
        sentAt: "2026-11-27T12:00:00.000Z",
      },
    ],
  },
]);
```

- `sent` returns a valid sent gateway response.
- `not-sent` returns `{ status: "not-sent" }`.
- `failure` throws a fixed generic error.

Unknown request identifiers and exhausted scenarios both return `not-sent`.
Every valid call is added to history before its step executes, including calls
that fail or return `not-sent`.

When the adapter is used with `createInbox`, Inbox converts `not-sent` to
`GATEWAY_REJECTED` and `failure` to `DELIVERY_FAILURE`. Both outcomes release
the outbound storage reservation, so a retry with the same `requestId` can
consume the next scripted step. After a successful response is recorded, the
Inbox storage deduplicates another request with that identifier without
calling the gateway again. The adapter supplements this core idempotence; it
does not replace a production provider idempotency guarantee.

`getHistory()` returns complete defensive snapshots of the validated gateway
requests, including new attachment arrays and copied `Uint8Array` values.
Configuration is also copied at construction. Mutating input requests,
scenario arrays, step objects, or returned history cannot change adapter
state.

The default limits are 100 scenarios, 20 steps per scenario, and 100 history
entries. Once full, history drops its oldest request. Lower
`maximumScenarios`, `maximumStepsPerScenario`, and `historyLimit` values can be
configured. Every limit must be an integer from 1 through its separately named
maximum in `inboxLimits`.

The complete configuration is validated at construction. Empty scenarios,
duplicate or invalid request identifiers, unknown or extended steps, invalid
provider message identifiers, invalid timestamps, and values over configured
bounds are rejected with a generic error. Requests are revalidated before
history or scenario state changes; invalid requests are not recorded.

## Attachment bounds

The same validation applies to inbound and outbound attachments:

- at most 10 attachments;
- at most 1 MiB per attachment;
- at most 5 MiB across all attachments;
- non-empty unique identifiers, up to 200 characters;
- non-empty filenames, up to 255 characters, with no `/`, `\\`, `.`, or `..`
  path forms;
- non-empty syntactically shaped MIME types, up to 100 characters;
- non-empty byte arrays.

Accepted metadata does not prove that a document is safe or that its bytes
match its declared MIME type. Inbox never executes, renders, interprets, or
writes attachment contents to disk.

Other public limits include 200 characters for provider and outbound request
identifiers, 254 for email addresses, 998 for subjects, and 100,000 for text
bodies. The in-memory adapter tracks at most 1,000 inbound messages and 1,000
outbound requests. Scripted delivery supports at most 100 scenarios, 20 steps
per scenario, and 100 history entries. Lower capacities can be configured for
tests.

## Storage and data handling

`InboxStorage` owns inbound create-if-absent records and outbound reservation,
completion, and release operations. `InMemoryInboxStorage` is process-local,
bounded, refuses silent replacement, and copies records on write and read.
Production adapters must provide equivalent atomic semantics.

Inbox performs no logging. It never logs message bodies or attachments. All
repository fixtures use synthetic addresses and content.

## Current limitations

- MIME parsing, provider downloads, real email providers, and real Steve email
  addresses are not implemented.
- Authentication, authorization, consent, tenant isolation, encryption,
  malware scanning, retention policies, and persistent storage are not
  implemented.
- The explicit outbound authorization signal is not a security boundary.
- There is no app, Agenda, Vault, or Reminders integration.
- Inbox does not verify sender identity or that a message is genuinely from a
  practice.
- Inbox does not inspect attachment bytes or prove that MIME metadata is true.
- Inbox does not diagnose, prescribe, medically interpret documents, book
  appointments, or create reminders.
- The in-memory adapter is suitable only for tests and local integration. No
  real or sensitive data should be provided to this milestone.
- The scripted mail gateway never delivers a real email and is not a
  production provider adapter.

## Check

```bash
pnpm --filter @steve/inbox test
pnpm --filter @steve/inbox typecheck
```
