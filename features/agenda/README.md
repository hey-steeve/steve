# agenda

## Role

`agenda` is the patient calendar core. It records confirmed appointments and
exports them as iCalendar content.

## Does

- Validates and records an appointment only when its confirmation is explicit.
- Retrieves, lists, and removes recorded appointments.
- Exports one recorded appointment as an `.ics` calendar string.
- Synchronizes a recorded appointment through an injectable calendar gateway.
- Uses an injectable storage contract.
- Provides an in-memory adapter for tests and local integration.

## Does not

- Records nothing provisional, refused, ambiguous, or invalid.
- Does not update or reschedule appointments.
- Does not send reminders.
- Does not include Google Calendar, OAuth, secrets, or network code.
- Does not persist data across process restarts.

## Inputs and outputs

The public API is exported from `src/index.ts`:

- `createAgenda(options)` creates an agenda with an `AppointmentStorage`, an
  `AgendaClock`, and an optional capacity.
- `Agenda.register(input)` validates and creates a confirmed appointment.
  Existing identifiers are never replaced.
- `Agenda.get(id)` retrieves one appointment.
- `Agenda.list()` returns appointments ordered by start instant, then by
  identifier using code-unit order. This makes ties deterministic across
  environments.
- `Agenda.remove(id)` deletes one appointment and returns the deleted value.
- `Agenda.exportIcs(id)` returns an iCalendar `VCALENDAR` string for one stored
  appointment. It does not write a file.
- `Agenda.syncCalendar(id)` explicitly synchronizes one stored appointment.
- `InMemoryAppointmentStorage` is the local, non-persistent adapter.
- `ScriptedCalendarGateway` is the deterministic local calendar adapter.

All operation results are discriminated by `status`. Errors are discriminated
by `kind`; storage exceptions become the generic `storage-error` and never
expose an internal exception message. Inputs and outputs are copied
defensively at both the service and in-memory storage boundaries.

## Confirmed appointments only

`confirmation.status` must be `confirmed` and `confirmation.reference` must be
non-empty. Identifiers, practitioner names, zoned ISO start/end timestamps, and
physical locations are validated locally. A physical appointment must have a
usable address, and the end instant must be strictly after the start instant.

No real patient data should be stored or committed. Tests use synthetic data.

## Limits

The public `agendaLimits` value documents the bounds enforced by the core:

- appointment identifiers: 128 characters;
- confirmation references: 256 characters;
- practitioner names: 200 characters;
- addresses and remote labels: 500 characters;
- zoned ISO timestamps: 40 characters;
- external calendar event identifiers: 256 characters;
- scripted scenarios and steps per scenario: 100 each;
- scripted history: 1,000 entries maximum, 100 by default;
- default agenda capacity: 1,000 appointments;
- maximum configurable capacity: 10,000 appointments.

The in-memory adapter is intended only for tests and local integration. Its
contents disappear when the process stops and it does not coordinate writes
between processes.

## iCalendar export

The export contains one `VEVENT`, uses CRLF line endings, converts zoned ISO
timestamps to UTC, escapes reserved text characters and newlines, and includes
`LOCATION` when one is available. `DTSTAMP` uses the injected clock, so callers
and tests can produce deterministic output.

## Calendar synchronization

`CalendarGateway.upsert()` is the provider boundary. `syncCalendar()` loads an
already recorded confirmed appointment and sends a defensive copy with its
Agenda identifier as the stable idempotency key. A real provider must honor
that key with an upsert rather than a blind insert. The core does not promise
exactly-once delivery across a network.

The optional gateway distinguishes missing configuration, invalid identifiers,
missing appointments, rejection, provider exceptions, invalid responses, and
storage errors. Responses are untrusted: exact properties, external IDs, and
zoned timestamps are validated before success. Exception details are hidden.

```ts
const gateway = new ScriptedCalendarGateway({
  scenarios: [{
    idempotencyKey: "appointment-demo-1",
    steps: [{ type: "rejected" }],
  }],
});
const agenda = createAgenda({ storage, clock, calendarGateway: gateway });
await agenda.syncCalendar("appointment-demo-1");
```

The scripted adapter consumes steps in order. Unknown and exhausted scenarios
return `rejected`; `failure` throws a fixed error. Every valid call is copied
into bounded history before execution. Configuration and history are copied
defensively.

## Depends on

No workspace package and no external service. The core emits the `.ics` format
directly.

## Rules

- Nothing enters the agenda without explicit confirmation from the practice.
- Never diagnose.

## Demo and production

Real Google Calendar synchronization, OAuth, network transport, durable
persistence, app integration, and reminders integration remain future work.

## Check

`pnpm --filter @steve/agenda test`

`pnpm --filter @steve/agenda typecheck`

## Status

Confirmed appointment core and calendar boundary implemented. A real provider,
persistence, and app integration remain to do.
