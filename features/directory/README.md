# directory

## Role

`directory` finds practitioners by specialty, by distance, and by conventionnement.

## Does

- Queries the real public Annuaire Santé.
- Sources: RPPS, annuaire.sante.fr, and ANS open data.

## Does not

- Does not book.
- Does not use Doctolib.
- A Doctolib partnership is only a future topic.
- No public Doctolib booking API.

## Inputs and outputs

- The input is the specialty, the distance, and the conventionnement. The contracts are to be defined.
- The output is the practitioners found. The contract is to be defined.

## Depends on

`@steve/shared`. The public Annuaire Santé: RPPS, annuaire.sante.fr, and ANS open data.

## Rules

- The source is the real public Annuaire Santé.
- The access mode, API or extracts, is to be checked.
- `directory` does not book.
- Never diagnose.
- Doctolib stays a future partnership, with no public booking API.

## Demo and production

The source stays the real Annuaire Santé. The access mode, API or extracts, is to be checked.

## Check

`pnpm --filter @steve/directory test`

The tests are to be defined. Access, API or extracts, is to be checked.

## Status

To do. Owner:
