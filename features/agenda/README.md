# agenda

## Rôle

`agenda` est le calendrier du patient. Il n'enregistre que les rendez-vous confirmés.

## Fait

- Enregistre un rendez-vous seulement s'il est confirmé.
- Synchronise Google Calendar.
- Synchronise un fichier `.ics`.
- Sert de source à `reminders`.

## Ne fait pas

- N'enregistre rien sans confirmation du cabinet.
- N'envoie pas les rappels.

## Entrées / sorties

- Entrée : rendez-vous confirmé. Le contrat `Appointment` est à définir.
- Sortie : calendrier du patient. Le contrat est à définir.
- `reminders` lit cette source. Le contrat est à définir.

## Dépend de

`@steve/shared`. Google Calendar. Le format `.ics`.

## Règles à tenir

- Rien n'entre dans l'agenda sans confirmation du cabinet.
- Ne jamais diagnostiquer.

## Démo vs prod

À définir.

## Vérifier

`pnpm --filter @steve/agenda test`

Les tests sont à définir.

## Statut

À faire. Owner :
