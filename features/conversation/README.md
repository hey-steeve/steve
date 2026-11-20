# conversation

## Rôle

`conversation` orchestre une conversation, en voix ou en texte, avec le même flux.

## Fait

- Accueille le patient.
- Comprend la demande.
- Passe la main.
- La voix passe par `voice`.
- Le texte est le chat de l'app. Le SMS et l'e-mail viendront plus tard, par `inbox`.

## Ne fait pas

- Ne fait pas le triage.
- Ne réserve pas.

## Entrées / sorties

- Entrée : un tour en voix, ou un tour en texte. Les contrats sont à définir.
- Sortie : passage de main. Les contrats sont à définir.

## Dépend de

`@steve/shared` seulement. Le lien avec `voice` et avec `inbox` passe par des contrats partagés, à définir.

## Règles à tenir

- Ne jamais diagnostiquer.
- Une urgence confirmée part vers le 15, sans réservation.
- Chaque conversation se termine avec le patient informé.

## Démo vs prod

Le flux est le même en voix et en texte. La différence entre la démo et la prod est à définir.

## Vérifier

`pnpm --filter @steve/conversation test`

Les tests sont à définir.

## Statut

À faire. Owner :
