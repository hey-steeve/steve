# triage

## Rôle

`triage` classe chaque tour, puis oriente vers un type de praticien et un délai.

## Fait

- Un classifieur LLM, petit et borné, tourne à chaque tour.
- La sortie est `urgent`, `watch` ou `not urgent`.
- Zod valide la sortie.
- Sortie invalide, ou délai dépassé : le résultat est `watch`, avec une question de confirmation.
- Urgence ou doute : une question de confirmation, puis renvoi vers le 15.
- Oriente vers un type de praticien et un délai.
- Les évaluations couvrent 50 à 100 cas piégeux. Exemple : "mon père a fait un AVC il y a 5 ans".
- Aucune urgence manquée n'est acceptée.
- Les jeux de données sont dans Langfuse.

## Ne fait pas

- Ne diagnostique pas.
- Ne prescrit pas.
- Pas de liste de mots-clés.
- Ne réserve pas.

## Entrées / sorties

- Entrée : le tour. Le contrat est à définir.
- Sortie : `urgent`, `watch` ou `not urgent`, validée par Zod. Le schéma est à définir.
- Orientation : type de praticien et délai. Les contrats sont à définir.

## Dépend de

`@steve/shared`, pour le client LLM. Zod. Langfuse.

## Règles à tenir

- Ne jamais diagnostiquer.
- Ne jamais prescrire.
- Pas de liste de mots-clés.
- Sortie invalide, ou délai dépassé : résultat `watch`, puis une question de confirmation.
- Urgence ou doute : question de confirmation, puis renvoi vers le 15.
- Une urgence confirmée part vers le 15, sans réservation.

## Démo vs prod

Le classifieur est le même. Le détail des jeux Langfuse est à définir.

## Vérifier

Les évaluations Langfuse couvrent 50 à 100 cas piégeux, avec zéro urgence manquée. La commande d'évaluation est à définir.

`pnpm --filter @steve/triage test`

Les tests du package sont à définir.

## Statut

À faire. Owner :
