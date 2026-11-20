# inbox

## Rôle

`inbox` est l'adresse e-mail de Steve.

## Fait

- Reçoit les confirmations.
- Reçoit les comptes rendus.
- Classe la confirmation ou le compte rendu dans `vault` ou dans `reminders`.
- Envoie des documents aux praticiens.

## Ne fait pas

- Ne diagnostique pas.
- Ne réserve pas.

## Entrées / sorties

- Entrée : confirmation, ou compte rendu. Les contrats sont à définir.
- Classement vers `vault`, ou vers `reminders`. Les contrats sont à définir.
- Sortie : document envoyé à un praticien. Le contrat est à définir.

## Dépend de

`@steve/shared`. Le lien avec `vault` et avec `reminders` passe par des contrats partagés, à définir.

## Règles à tenir

- Ne jamais diagnostiquer.
- Rien n'entre dans l'agenda sans confirmation du cabinet.
- Les rappels ne portent que sur les rendez-vous qui sont dans l'agenda.

## Démo vs prod

À définir.

## Vérifier

`pnpm --filter @steve/inbox test`

Les tests sont à définir.

## Statut

À faire. Owner :
