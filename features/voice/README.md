# voice

## Rôle

`voice` relie Twilio au fournisseur vocal et transporte l'audio dans les deux sens.

## Fait

- Relie Twilio au fournisseur vocal.
- Grok est le premier fournisseur.
- Une variable d'environnement remplace le fournisseur.
- L'audio va dans les deux sens.

## Ne fait pas

- Ne décide rien.

## Entrées / sorties

- Entrée : audio Twilio. Le contrat est à définir.
- Sortie : audio vers le fournisseur, et audio en retour. Les contrats sont à définir.
- `voice` utilise l'interface `VoiceProvider` de `@steve/shared`.

## Dépend de

`@steve/shared`, pour l'interface `VoiceProvider`. Twilio. Le fournisseur vocal. Grok est le premier.

## Règles à tenir

- `voice` ne décide rien.
- Ne jamais diagnostiquer.

## Démo vs prod

Une variable d'environnement choisit le fournisseur vocal. Grok est le premier. Le reste est à définir.

## Ressources

- Twilio Voice
- Media Streams

## Vérifier

`pnpm --filter @steve/voice test`

Les tests sont à définir.

## Statut

À faire. Owner :
