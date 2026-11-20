# directory

## Rôle

`directory` trouve des praticiens par spécialité, par distance et par conventionnement.

## Fait

- Interroge le vrai Annuaire Santé public.
- Sources : RPPS, annuaire.sante.fr, données ouvertes de l'ANS.

## Ne fait pas

- Ne réserve pas.
- N'utilise pas Doctolib.
- Un partenariat Doctolib est seulement un sujet futur.
- Pas d'API publique de réservation Doctolib.

## Entrées / sorties

- Entrée : spécialité, distance, conventionnement. Les contrats sont à définir.
- Sortie : praticiens trouvés. Le contrat est à définir.

## Dépend de

`@steve/shared`. L'Annuaire Santé public : le RPPS, annuaire.sante.fr, et les données ouvertes de l'ANS.

## Règles à tenir

- La source est l'Annuaire Santé public réel.
- Le mode d'accès, API ou extraits, est à vérifier.
- `directory` ne réserve pas.
- Ne jamais diagnostiquer.
- Doctolib reste un partenariat futur, sans API publique de réservation.

## Démo vs prod

La source reste l'Annuaire Santé réel. Le mode d'accès, API ou extraits, est à vérifier.

## Vérifier

`pnpm --filter @steve/directory test`

Les tests sont à définir. L'accès, API ou extraits, est à vérifier.

## Statut

À faire. Owner :
