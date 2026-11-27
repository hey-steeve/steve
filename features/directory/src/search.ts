import type { DirectoryQuery, DirectorySearchResult } from "@steve/shared";
import type { PractitionerSource, PractitionerSourceFailureReason } from "./fhir-client.ts";
import { filterAndRankPractitioners, validateDirectoryQuery } from "./filter.ts";

export type DirectorySearchFailureReason =
  | "invalid-query"
  | "unknown-specialty"
  | PractitionerSourceFailureReason;

export type DirectorySearchOutcome =
  | { readonly ok: true; readonly result: DirectorySearchResult }
  | { readonly ok: false; readonly reason: DirectorySearchFailureReason };

export type SearchDirectoryDeps = {
  readonly source: PractitionerSource;
};

export async function searchPractitioners(
  query: DirectoryQuery,
  deps: SearchDirectoryDeps,
): Promise<DirectorySearchOutcome> {
  const validated = validateDirectoryQuery(query);
  if (!validated.ok) {
    return validated;
  }

  let fetched;
  try {
    fetched = await deps.source.fetchPractitioners(validated.value);
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!fetched.ok) {
    return fetched;
  }

  const practitioners = filterAndRankPractitioners(fetched.practitioners, validated.value);
  return {
    ok: true,
    result: {
      practitioners,
      source: "annuaire-sante-fhir",
    },
  };
}
