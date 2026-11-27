import { expect, expectTypeOf, it } from "vitest";
import { conventionnements, directorySources } from "./index.js";
import type {
  Conventionnement,
  DirectoryQuery,
  DirectorySearchResult,
  DirectorySource,
  GeoPoint,
  Practitioner,
  PractitionerAddress,
} from "./index.js";

it("lists the supported conventionnement values", () => {
  const values = conventionnements.map((value) => {
    const practitioner = {
      rpps: "10000000001",
      firstName: "Camille",
      lastName: "Durand",
      specialtyCode: "SM54",
      specialtyLabel: "Médecine générale",
      conventionnement: value,
      address: {
        postalCode: "75011",
        city: "Paris",
      },
    } satisfies Practitioner;
    return practitioner.conventionnement;
  });

  expect(values).toEqual([
    "secteur-1",
    "secteur-2",
    "secteur-2-optam",
    "non-conventionne",
  ]);
  expectTypeOf<Conventionnement>().toEqualTypeOf<
    "secteur-1" | "secteur-2" | "secteur-2-optam" | "non-conventionne"
  >();
  expectTypeOf<"secteur-3">().not.toMatchTypeOf<Conventionnement>();
  expectTypeOf<string>().not.toMatchTypeOf<Conventionnement>();
});

it("lists the supported directory sources", () => {
  expect(directorySources).toEqual(["annuaire-sante-fhir"]);
  expectTypeOf<DirectorySource>().toEqualTypeOf<"annuaire-sante-fhir">();
  expectTypeOf<"doctolib">().not.toMatchTypeOf<DirectorySource>();
});

it("describes a geographic point and practitioner address", () => {
  expectTypeOf<GeoPoint>().branded.toEqualTypeOf<{
    readonly lat: number;
    readonly lon: number;
  }>();
  expectTypeOf<PractitionerAddress>().branded.toEqualTypeOf<{
    readonly line?: string;
    readonly postalCode: string;
    readonly city: string;
    readonly location?: GeoPoint;
  }>();
});

it("describes a practitioner with RPPS identity, specialty, address, and optional fields", () => {
  expectTypeOf<Practitioner>().branded.toEqualTypeOf<{
    readonly rpps: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly specialtyCode: string;
    readonly specialtyLabel: string;
    readonly conventionnement?: Conventionnement;
    readonly phone?: string;
    readonly address: PractitionerAddress;
    readonly distanceKm?: number;
  }>();
});

it("describes a directory query and search result", () => {
  expectTypeOf<DirectoryQuery>().branded.toEqualTypeOf<{
    readonly specialty: string;
    readonly postalCode?: string;
    readonly origin?: GeoPoint;
    readonly maxDistanceKm?: number;
    readonly conventionnement?: Conventionnement;
    readonly limit?: number;
  }>();
  expectTypeOf<DirectorySearchResult>().branded.toEqualTypeOf<{
    readonly practitioners: readonly Practitioner[];
    readonly source: DirectorySource;
  }>();
});
