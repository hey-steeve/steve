# reminders

## Rôle

`reminders` envoie un rappel de rendez-vous ou de médicament, par appel ou par SMS, seulement pour un rendez-vous de l'agenda.

## Fait

- Rappel de rendez-vous.
- Rappel de médicament.
- Canal : appel, ou SMS.
- Le rendez-vous doit être dans `agenda`.

## Ne fait pas

- Pas de rappel si le rendez-vous n'est pas dans l'agenda.
- Ne réserve pas.
- Ne diagnostique pas.

## Entrées / sorties

- Entrée : rendez-vous présent dans `agenda`. Le contrat est à définir.
- Sortie : rappel par appel, ou rappel par SMS. Les contrats sont à définir.

## Dépend de

`@steve/shared`. La source est `agenda`, par un contrat partagé à définir.

## Règles à tenir

- Les rappels ne portent que sur les rendez-vous qui sont dans l'agenda.
- Ne jamais diagnostiquer.

## Démo vs prod

À définir.

## Vérifier

`pnpm --filter @steve/reminders test`

Les tests sont à définir.

## Statut

À faire. Owner :
