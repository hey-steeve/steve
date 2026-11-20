# shared

## Rôle

`shared` porte les contrats typés du workspace, sans logique métier.

## Fait

- Contrats typés.
- Interface `VoiceProvider`.
- Logger.
- Client LLM.
- Jetons de design.

## Ne fait pas

- Pas de logique métier.

## Entrées / sorties

Les features importent `@steve/shared`. Les contrats prévus sont l'interface `VoiceProvider`, le logger, le client LLM et les jetons de design. Les autres noms sont à définir.

## Dépend de

Aucun package du workspace.

## Règles à tenir

- Ne jamais diagnostiquer. `shared` ne porte pas cette décision.

## Démo vs prod

À définir.

## Vérifier

`pnpm --filter @steve/shared test`

Les tests sont à définir.

## Statut

À faire. Owner :
