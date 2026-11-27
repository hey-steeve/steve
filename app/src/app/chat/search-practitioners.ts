"use server";

import { createAnnuaireSanteClient, searchPractitioners } from "@steve/directory";
import type { Practitioner } from "@steve/shared";
import { parseDirectoryFilters } from "../../chat/directory-query";
import { envString } from "../api/env";

export type DirectoryResult =
  | { readonly kind: "found"; readonly practitioners: readonly Practitioner[]; readonly demo: boolean }
  | { readonly kind: "failed" };

const demoOrigin = { lat: 48.858, lon: 2.371 };
const demoPractitioners: readonly Practitioner[] = [
  {
    rpps: "10000000104", firstName: "Camille", lastName: "Lunéval",
    specialtyCode: "SM54", specialtyLabel: "Médecine générale", conventionnement: "secteur-1",
    address: { line: "1 rue des Lanternes Mauves", postalCode: "75011", city: "Paris", location: { lat: 48.859, lon: 2.377 } },
  },
  {
    rpps: "10000000101", firstName: "Sacha", lastName: "Clairsonge",
    specialtyCode: "SM15", specialtyLabel: "Dermatologie", conventionnement: "secteur-1",
    address: { line: "4 rue des Nuages Mauves", postalCode: "75011", city: "Paris", location: { lat: 48.865, lon: 2.373 } },
  },
  {
    rpps: "10000000102", firstName: "Inès", lastName: "Valbrume",
    specialtyCode: "SM15", specialtyLabel: "Dermatologie", conventionnement: "secteur-1",
    address: { line: "9 passage des Lucioles", postalCode: "75011", city: "Paris", location: { lat: 48.850, lon: 2.381 } },
  },
  {
    rpps: "10000000103", firstName: "Lina", lastName: "Ormelune",
    specialtyCode: "SM15", specialtyLabel: "Dermatologie", conventionnement: "secteur-2",
    address: { line: "11 allée des Brumes", postalCode: "75011", city: "Paris", location: { lat: 48.851, lon: 2.368 } },
  },
];

export async function runPractitionerSearch(input: unknown): Promise<DirectoryResult> {
  const filters = parseDirectoryFilters(input);
  if (filters === undefined) return { kind: "failed" };
  const apiKey = envString("ESANTE_API_KEY");
  const demo = apiKey === undefined;
  const outcome = await searchPractitioners(
    { ...filters, limit: 4, ...(demo && filters.postalCode === "75011" ? { origin: demoOrigin } : {}) },
    {
      source: apiKey === undefined
        ? { fetchPractitioners: ({ specialty }) => Promise.resolve({
            ok: true,
            practitioners: demoPractitioners.filter((item) => item.specialtyCode === specialty.code),
          }) }
        : createAnnuaireSanteClient({ apiKey }),
    },
  );
  return outcome.ok
    ? { kind: "found", practitioners: outcome.result.practitioners, demo }
    : { kind: "failed" };
}
