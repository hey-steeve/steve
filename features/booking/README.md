# booking

## Rôle

`booking` reçoit un praticien choisi, appelle le cabinet en voix, et rapporte un créneau confirmé ou refusé.

## Fait

- Reçoit un praticien choisi.
- Passe l'appel vocal sortant vers le cabinet.
- Retourne un créneau confirmé, ou un créneau refusé.
- Essaie au plus 2 praticiens.

## Ne fait pas

- Pas de conseil médical.
- Ne diagnostique pas.
- N'enregistre pas le rendez-vous. `agenda` le fait, et seulement après confirmation du cabinet.

## Entrées / sorties

- Entrée : praticien choisi. Le contrat est à définir.
- Sortie : créneau confirmé, ou créneau refusé. Le contrat est à définir.

## Dépend de

`@steve/shared`. Appel vocal sortant. Le détail du canal est à définir.

## Règles à tenir

- Au plus 2 praticiens.
- Pas de conseil médical.
- Ne jamais diagnostiquer.
- Une urgence confirmée part vers le 15, sans réservation.
- Rien n'entre dans l'agenda sans confirmation du cabinet.
- En démo, ne jamais appeler un vrai cabinet.

## Démo vs prod

`booking` appelle le cabinet. En démo, une variable d'environnement remplace le numéro du cabinet par le numéro d'un coéquipier. La démo n'appelle pas un vrai cabinet.

## Vérifier

`pnpm --filter @steve/booking test`

Les tests sont à définir.

## Statut

À faire. Owner :
