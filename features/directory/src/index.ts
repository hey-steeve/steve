export { distanceKm, isValidGeoPoint } from "./distance.ts";
export {
  ANNUAIRE_SANTE_FHIR_URL,
  DIRECTORY_MAX_RESPONSE_BYTES,
  DIRECTORY_TIMEOUT_MS,
  createAnnuaireSanteClient,
} from "./fhir-client.ts";
export type {
  AnnuaireSanteConfig,
  PractitionerSource,
  PractitionerSourceFailureReason,
  PractitionerSourceOutcome,
} from "./fhir-client.ts";
export {
  DEFAULT_DIRECTORY_LIMIT,
  MAX_DIRECTORY_LIMIT,
  MAX_DISTANCE_KM,
  filterAndRankPractitioners,
  validateDirectoryQuery,
} from "./filter.ts";
export type { QueryValidationResult, ValidatedDirectoryQuery } from "./filter.ts";
export { searchPractitioners } from "./search.ts";
export type {
  DirectorySearchFailureReason,
  DirectorySearchOutcome,
  SearchDirectoryDeps,
} from "./search.ts";
export { resolveSpecialty } from "./specialty.ts";
export type { SpecialtyKind, SpecialtyMatch } from "./specialty.ts";
