# reminders

## Role

`@steve/reminders` schedules and dispatches appointment or declared-medication
reminders by simulated SMS or call. Every reminder is linked to an appointment
that still exists in Agenda. The package does not import `@steve/agenda`;
orchestrators adapt Agenda to the local `AgendaSource` port.

The core is deterministic and side-effect free apart from its injected ports.
It does not start a timer, worker, or background loop.

## Public API

The package exports its public API from `src/index.ts`:

- `createReminderService(dependencies)` creates the reminder service.
- `InMemoryReminderStorage` is a bounded, defensive in-memory adapter.
- `AgendaSource` looks up an appointment by identifier.
- `ReminderSender` sends a prepared message through `sms` or `call`.
- `ScriptedReminderSender` runs deterministic in-memory delivery scenarios for
  tests, demos, and local integrations.
- `ScriptedReminderScenario` assigns ordered safe steps to a reminder
  identifier.
- `ScriptedReminderStep` is a discriminated `sent`, `rejected`, or simulated
  `failure` step.
- `ReminderStorage` allows persistence to be replaced without changing the
  domain service.
- `reminderChannels` and `reminderLimits` expose accepted channels and bounds.

```ts
import {
  InMemoryReminderStorage,
  createReminderService,
  type AgendaSource,
  type ReminderSender,
} from "@steve/reminders";

const agendaSource: AgendaSource = {
  async getAppointment(appointmentId) {
    return appointmentId === "apt_synthetic"
      ? {
          id: "apt_synthetic",
          startAt: "2026-11-28T10:00:00+01:00",
          title: "Synthetic appointment",
        }
      : null;
  },
};

const sender: ReminderSender = {
  async send(message) {
    // A demo adapter can inspect message.channel and simulate delivery.
    return { ok: true };
  },
};

const reminders = createReminderService({
  agendaSource,
  sender,
  storage: new InMemoryReminderStorage(),
  now: () => new Date("2026-11-27T09:00:00.000Z"),
  generateId: () => "rem_synthetic",
});

await reminders.schedule({
  appointmentId: "apt_synthetic",
  remindAt: "2026-11-28T08:00:00+01:00",
  channel: "sms",
  details: { type: "appointment" },
});

// The application orchestrator calls this explicitly when it wants due work.
await reminders.dispatchDue();
```

All service operations return a discriminated `ReminderResult<T>`. Reminder
records also use discriminated states: `scheduled`, `dispatching`, `sent`,
`failed`, and `cancelled`.

## Reminder types and channels

`details` is a discriminated union:

- `{ type: "appointment" }` produces a sober deterministic reminder using only
  explicit Agenda fields.
- `{ type: "medication", instruction }` copies the declared instruction into
  the message. It never invents a dose, frequency, indication, treatment, or
  medical advice.

The supported channels are `sms` and `call`. Both go through the same injected
`ReminderSender`; this core contains no Twilio or real delivery integration.

## Scripted sender

`ScriptedReminderSender` implements `ReminderSender` without a network request,
timer, worker, provider credential, or real phone number. Each send consumes the
next configured step for that reminder identifier:

- `sent` returns exactly `{ ok: true }`;
- `rejected` returns exactly `{ ok: false }`; and
- `failure` throws the generic `Scripted reminder delivery failed` error.

An unknown reminder or an exhausted sequence safely returns `{ ok: false }`.
The adapter records every valid send attempt, including rejected and failed
attempts. `getHistory()` returns defensive copies in attempt order.

```ts
import {
  InMemoryReminderStorage,
  ScriptedReminderSender,
  createReminderService,
} from "@steve/reminders";

const sender = new ScriptedReminderSender([
  {
    reminderId: "rem_synthetic",
    steps: [
      { kind: "rejected" },
      { kind: "sent" },
    ],
  },
]);

let now = new Date("2026-11-27T09:00:00.000Z");
const reminders = createReminderService({
  agendaSource: {
    async getAppointment() {
      return {
        id: "apt_synthetic",
        startAt: "2026-11-28T10:00:00.000Z",
        title: "Synthetic appointment",
      };
    },
  },
  sender,
  storage: new InMemoryReminderStorage(),
  now: () => new Date(now),
  generateId: () => "rem_synthetic",
});

await reminders.schedule({
  appointmentId: "apt_synthetic",
  remindAt: "2026-11-27T10:00:00.000Z",
  channel: "sms",
  details: { type: "appointment" },
});

now = new Date("2026-11-27T10:00:00.000Z");
await reminders.dispatchDue(); // rejected; the reminder becomes failed
await reminders.dispatchDue(); // sent; the explicit retry succeeds
```

The constructor copies and validates its configuration. It rejects duplicate
reminder identifiers, unknown or structurally ambiguous steps, and values over
these exported limits:

- `MAX_SCRIPTED_REMINDERS` is 100 scenarios;
- `MAX_SCRIPTED_STEPS_PER_REMINDER` is 20 steps per scenario;
- `MAX_SCRIPTED_HISTORY_ENTRIES` is 200 retained attempts; and
- `MAX_SCRIPTED_MESSAGE_BODY_CHARACTERS` is 1,000 characters.

`historyLimit` may reduce retained history but cannot exceed the package
maximum. The adapter never mutates its scenario configuration or a received
`ReminderMessage`.

## Scheduling rules

- `AgendaSource.getAppointment` must return the requested appointment when the
  reminder is scheduled.
- `remindAt` must be a valid ISO timestamp with `Z` or an explicit numeric
  offset.
- `remindAt` must be strictly after the injected clock and strictly before the
  appointment start.
- Identifiers, appointment display fields, medication instructions, stored
  lists, and in-memory capacity are bounded by `reminderLimits`.
- A combination of appointment identifier, reminder type, channel, and
  normalized reminder time can be stored only once. Cancellation does not
  release that deduplication key.
- Listing is deterministic: reminder time first, then reminder identifier.

## Cancellation

`cancel(id)` transitions a scheduled or failed reminder to `cancelled`. A
second cancellation succeeds with the explicit `already-cancelled` outcome.
Sent and currently dispatching reminders return `REMINDER_NOT_CANCELLABLE`.

If Agenda no longer contains an appointment when its reminder becomes due,
`dispatchDue` cancels the reminder with the `appointment-missing` reason and
does not call the sender.

## Dispatch behavior

`dispatchDue` is the only dispatch trigger. An external orchestrator must call
it; this package never creates a timer or background process.

Due reminders are processed by reminder time and then identifier. Before every
attempt, the service checks Agenda again and atomically claims the reminder as
`dispatching`. Sent, cancelled, or already-dispatching reminders are not sent.
This prevents overlapping calls on the same storage adapter from sending the
same reminder twice.

The sender receives a defensive copy of a deterministic message. Only an exact
`{ ok: true }` response counts as success. Exceptions, explicit rejection, and
invalid or ambiguous responses transition the reminder to `failed` with the
generic `delivery-failed` reason. Provider exception messages are never
returned or stored.

A failed reminder is eligible for another attempt only when an orchestrator
calls `dispatchDue` again. There is no automatic retry or retry timer. The
`attemptCount` records each claimed delivery attempt.

## Storage

`ReminderStorage` is injected. Implementations must preserve atomic `create`
and compare-state `replace` behavior so deduplication and dispatch claims stay
safe. The supplied `InMemoryReminderStorage`:

- defaults to at most 1,000 reminders and accepts a smaller capacity;
- copies nested reminder data on write and read;
- keeps deduplication keys after cancellation; and
- is intended for tests and demos, not durable production state.

Storage and dependency failures are converted to bounded generic errors. The
core does not log patient content.

## Safety boundaries

The feature schedules and relays declared information. It does not diagnose,
interpret health content, prescribe, recommend a treatment change, or generate
messages with an LLM. Tests and examples use synthetic data only.

## Check

```sh
pnpm --filter @steve/reminders test
pnpm --filter @steve/reminders typecheck
```

## Not included yet

- Twilio, real SMS, and real outbound calls.
- Durable persistence or distributed locking.
- An application-level scheduler or worker that calls `dispatchDue`.
- Integration with `app/` or a concrete Agenda adapter.
- Patient-facing UI.
