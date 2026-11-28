# Features

Ten features. The detail is in each README. The common contracts are in the [shared README](../shared/README.md).

- [voice](voice/README.md) holds the in-app live-call primitives over xAI Realtime and decides nothing. The live call in the app is planned. Twilio comes later.
- [conversation](conversation/README.md) runs the conversation, by voice or by text, then hands off.
- [triage](triage/README.md) classifies each turn as emergency, consult, self-care, or need-info.
- [directory](directory/README.md) finds practitioners in the public Annuaire Santé, and does not book.
- [booking](booking/README.md) calls the chosen practice and returns a confirmed or refused slot.
- [agenda](agenda/README.md) records only confirmed appointments.
- [profile](profile/README.md) stores patient memory, without interpreting it.
- [vault](vault/README.md) stores, retrieves, and summarizes documents, with no medical interpretation.
- [reminders](reminders/README.md) sends a reminder for an appointment or a medication, only for an appointment in the agenda.
- [inbox](inbox/README.md) receives confirmations and reports, files them, and sends documents to practitioners.

## Rules

- Never diagnose.
- The patient-facing 15 and 3114 wording stays in `app/src/app/api/chat/system-prompt.ts`. Triage carries the numbers as call data. Steve does not route to 112 or SOS Médecins.
- `app/src/app/api/chat/route.test.ts` rejects `When in doubt, call 15.` and `call 116 117`. The same file checks the system prompt and each triage guidance string with one matcher. The matcher applies NFC, strips accents, turns Unicode spaces into a space, turns apostrophes into `'`, and lowercases. It then flags `ne`, `n'`, `pas`, `jamais`, `sans`, or a word starting with `evit` within 32 characters of `15`, `3114`, or `samu`. It also flags `ne pas appeler`. Approved sentences in the system prompt are allowlisted. The live prompt passes. Both guidance strings pass. An injected variant fails.
- Steve does not book a 15 or 3114 referral.
- Nothing enters the agenda without confirmation from the practice.
- Reminders cover only appointments that are in the agenda.
- Every conversation ends with the patient informed.

## Statechart

The `voice/call` legend color now covers `voice` and `conversation`.

```mermaid
---
title: "A call to Steve"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: voice/call
    lg1: triage
    lg2: emergency
    lg3: directory
    lg4: booking
    lg5: agenda/reminders
    lg6: vault
  }
  class lg0 blue
  class lg1 yellow
  class lg2 pink
  class lg3 teal
  class lg4 orange
  class lg5 purple
  class lg6 tan
  s0: Incoming call
  s1: Steve greets and listens
  s2: Triage in progress
  s4: Practitioner search
  s5: Document or question
  s6: Practitioner choice
  s7: Recap to the patient
  s8: Referral to 15 or 3114
  s9: Steve calls the practice
  s10: Call ended
  s11: Slot confirmed
  s12: Slot refused
  s13: Appointment in the agenda
  [*] --> s0
  s0 --> s1: The patient calls
  s1 --> s2: The patient explains the request
  s2 --> s8: 15 or 3114 referral
  s2 --> s4: Not urgent [appointment request]
  s2 --> s5: Not urgent [document or question]
  s4 --> s6: Steve suggests nearby practitioners
  s5 --> s7: Steve files or summarizes the document
  s6 --> s8: The patient describes a serious symptom [triage on every turn]
  s6 --> s9: The patient chooses a practitioner
  s7 --> s10: Steve recaps and hangs up
  s8 --> s10: Steve gives the order of 15 and 3114 in app/src/app/api/chat/system-prompt.ts and hangs up
  s9 --> s11: The practice confirms the slot
  s9 --> s12: The practice refuses
  s11 --> s13: Steve records the appointment in the agenda
  s12 --> s6: Steve suggests another practitioner [fewer than 2 tries]
  s13 --> s7: Steve schedules the reminders
  s12 --> s7: Steve gives up [2 practices refused]
  class s0 blue
  class s1 blue
  class s2 yellow
  class s4 teal
  class s5 tan
  class s6 teal
  class s8 pink
  class s9 orange
  class s11 purple
  class s12 orange
  class s13 purple
```
