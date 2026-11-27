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

- Input: `DirectoryQuery` (`specialty`, optional `postalCode`, `origin`, `maxDistanceKm`, `conventionnement`, `limit`), defined in `@steve/shared`.
- Output: `DirectorySearchOutcome`, wrapping `DirectorySearchResult` (`practitioners`, `source`) on success or a typed failure reason.

## Depends on

`@steve/shared`. The public Annuaire Santé FHIR v2 API (`https://gateway.api.esante.gouv.fr/fhir/v2`, header `ESANTE-API-KEY`).

## Rules

- The source is the real public Annuaire Santé.
- Access mode: ANS Annuaire Santé FHIR v2 API (`PractitionerRole` with `_include` for `Practitioner` and `Organization`, plus `as-ext-practitionerrole-contracted` for conventionnement).
- `directory` does not book.
- Never diagnose.
- Doctolib stays a future partnership, with no public booking API.

## Demo and production

Both use the real ANS Annuaire Santé FHIR v2 API via `ESANTE_API_KEY`. Tests inject `fetch` or `PractitionerSource` with synthetic data only.

## Check

`pnpm --filter @steve/directory test`

`pnpm --filter @steve/directory typecheck`

## Status

Done (contracts, domain primitives, and ANS FHIR v2 client). Owner:
