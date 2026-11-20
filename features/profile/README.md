# profile

## Rôle

`profile` garde la mémoire du patient, sans l'interpréter.

## Fait

- Identité.
- Antécédents déclarés.
- Préférences.
- Historique des appels.

## Ne fait pas

- N'interprète pas cette mémoire.
- Ne diagnostique pas.

## Entrées / sorties

- Entrée : identité, antécédents déclarés, préférences, historique des appels. Les contrats sont à définir.
- Sortie : mémoire relue. Les contrats sont à définir.

## Dépend de

`@steve/shared`.

## Règles à tenir

- Aucune interprétation.
- Ne jamais diagnostiquer.

## Démo vs prod

À définir.

## Vérifier

`pnpm --filter @steve/profile test`

Les tests sont à définir.

## Statut

À faire. Owner :
