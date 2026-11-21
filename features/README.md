# Features

Ten features. The detail is in each README. The common contracts are in the [shared README](../shared/README.md).

- [voice](voice/README.md) connects Twilio to the voice provider, carries the audio, and decides nothing.
- [conversation](conversation/README.md) runs the conversation, by voice or by text, then hands off.
- [triage](triage/README.md) classifies each turn and orients toward a practitioner type and a delay.
- [directory](directory/README.md) finds practitioners in the public Annuaire Santé, and does not book.
- [booking](booking/README.md) calls the chosen practice and returns a confirmed or refused slot.
- [agenda](agenda/README.md) records only confirmed appointments.
- [profile](profile/README.md) stores patient memory, without interpreting it.
- [vault](vault/README.md) stores, retrieves, and summarizes documents, with no medical interpretation.
- [reminders](reminders/README.md) sends a reminder for an appointment or a medication, only for an appointment in the agenda.
- [inbox](inbox/README.md) receives confirmations and reports, files them, and sends documents to practitioners.

## Rules

- Never diagnose.
- 15 is only for a real emergency.
- A real emergency is physical warning signs, an overdose, self-harm, or immediate danger.
- For an ordinary symptom, Steve names 15 only beside physical warning signs.
- Doubt does not default to 15.
- 3114 is for psychological distress and for suicidal thoughts.
- An overdose or self-harm that includes suicidal thoughts or psychological distress starts with 3114 and then adds 15.
- For suicidal thoughts or psychological distress, with no overdose, no self-harm and no physical warning sign, Steve gives 3114 first and adds 15 only for immediate danger.
- With no overdose and no self-harm, Steve gives 15 first, then 3114, when a physical warning sign comes with suicidal thoughts or psychological distress. Chest pain during a panic attack is an example.
- Steve never gives 112 or SOS Médecins.
- The wording is `app/src/app/api/chat/system-prompt.ts`.
- `app/src/app/api/chat/route.test.ts` rejects only the literals `Dans le doute, appelle le 15.` and `appelle le 116 117`.
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
  s3: Confirmation question
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
  s2 --> s3: Possible 15 or 3114 referral
  s2 --> s4: Not urgent [appointment request]
  s2 --> s5: Not urgent [document or question]
  s3 --> s4: The patient denies the emergency [appointment request]
  s3 --> s8: Confirmed 15 or 3114 referral
  s3 --> s5: The patient denies the emergency [document or question]
  s4 --> s6: Steve suggests nearby practitioners
  s5 --> s7: Steve files or summarizes the document
  s6 --> s3: The patient describes a serious symptom [triage on every turn]
  s6 --> s9: The patient chooses a practitioner
  s7 --> s10: Steve recaps and hangs up
  s8 --> s10: Steve gives 15, or 3114, or 3114 then 15, or 15 then 3114, and hangs up
  s9 --> s11: The practice confirms the slot
  s9 --> s12: The practice refuses
  s11 --> s13: Steve records the appointment in the agenda
  s12 --> s6: Steve suggests another practitioner [fewer than 2 tries]
  s13 --> s7: Steve schedules the reminders
  s3 --> s6: The patient denies the emergency [practitioner choice in progress]
  s12 --> s7: Steve gives up [2 practices refused]
  class s0 blue
  class s1 blue
  class s2 yellow
  class s3 yellow
  class s4 teal
  class s5 tan
  class s6 teal
  class s8 pink
  class s9 orange
  class s11 purple
  class s12 orange
  class s13 purple
```
