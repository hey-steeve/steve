# Features

Dix features. Le détail est dans chaque README. Les contrats communs sont dans le [README de shared](../shared/README.md).

- [voice](voice/README.md) relie Twilio au fournisseur vocal, transporte l'audio, et ne décide rien.
- [conversation](conversation/README.md) orchestre la conversation, en voix ou en texte, puis passe la main.
- [triage](triage/README.md) classe chaque tour et oriente vers un type de praticien et un délai.
- [directory](directory/README.md) trouve des praticiens dans l'Annuaire Santé public, et ne réserve pas.
- [booking](booking/README.md) appelle le cabinet choisi et rapporte un créneau confirmé ou refusé.
- [agenda](agenda/README.md) enregistre seulement les rendez-vous confirmés.
- [profile](profile/README.md) garde la mémoire du patient, sans l'interpréter.
- [vault](vault/README.md) stocke, retrouve et résume des documents, sans interprétation médicale.
- [reminders](reminders/README.md) rappelle un rendez-vous ou un médicament, seulement pour un rendez-vous de l'agenda.
- [inbox](inbox/README.md) reçoit les confirmations et les comptes rendus, les classe, et envoie des documents aux praticiens.

## Règles

- Ne jamais diagnostiquer.
- Une urgence confirmée part vers le 15, sans réservation.
- Rien n'entre dans l'agenda sans confirmation du cabinet.
- Les rappels ne portent que sur les rendez-vous qui sont dans l'agenda.
- Chaque conversation se termine avec le patient informé.

## Statechart

La couleur `voice/call` de la légende couvre maintenant `voice` et `conversation`.

```mermaid
---
title: "Un appel à Steve"
---
stateDiagram-v2
  state "Legend" as legend {
    lg0: voice/call
    lg1: triage
    lg2: urgence
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
  s0: Appel entrant
  s1: Steve accueille et écoute
  s2: Triage en cours
  s3: Question de confirmation
  s4: Recherche de praticiens
  s5: Document ou question
  s6: Choix du praticien
  s7: Récapitulatif au patient
  s8: Renvoi vers le 15
  s9: Steve appelle le cabinet
  s10: Appel terminé
  s11: Créneau confirmé
  s12: Créneau refusé
  s13: RDV dans l'agenda
  [*] --> s0
  s0 --> s1: Le patient appelle
  s1 --> s2: Le patient explique sa demande
  s2 --> s3: Urgence détectée ou doute
  s2 --> s4: Non urgent [demande de RDV]
  s2 --> s5: Non urgent [document ou question]
  s3 --> s4: Le patient dément [demande de RDV]
  s3 --> s8: Urgence confirmée ou doute persistant
  s3 --> s5: Le patient dément [document ou question]
  s4 --> s6: Steve propose des praticiens proches
  s5 --> s7: Steve range ou résume le document
  s6 --> s3: Le patient décrit un symptôme grave [triage à chaque tour]
  s6 --> s9: Le patient choisit un praticien
  s7 --> s10: Steve récapitule et raccroche
  s8 --> s10: Steve dit d'appeler le 15 et raccroche
  s9 --> s11: Le cabinet confirme le créneau
  s9 --> s12: Le cabinet refuse
  s11 --> s13: Steve inscrit le RDV dans l'agenda
  s12 --> s6: Steve propose un autre praticien [moins de 2 essais]
  s13 --> s7: Steve programme les rappels
  s3 --> s6: Le patient dément [praticien en cours de choix]
  s12 --> s7: Steve abandonne [2 cabinets refusés]
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
