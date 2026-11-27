export const conventionnements = [
  "secteur-1",
  "secteur-2",
  "secteur-2-optam",
  "non-conventionne",
] as const;

export type Conventionnement = (typeof conventionnements)[number];

export const directorySources = ["annuaire-sante-fhir"] as const;

export type DirectorySource = (typeof directorySources)[number];

export type GeoPoint = {
  readonly lat: number;
  readonly lon: number;
};

export type PractitionerAddress = {
  readonly line?: string;
  readonly postalCode: string;
  readonly city: string;
  readonly location?: GeoPoint;
};

export type Practitioner = {
  readonly rpps: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly specialtyCode: string;
  readonly specialtyLabel: string;
  readonly conventionnement?: Conventionnement;
  readonly phone?: string;
  readonly address: PractitionerAddress;
  readonly distanceKm?: number;
};

export type DirectoryQuery = {
  readonly specialty: string;
  readonly postalCode?: string;
  readonly origin?: GeoPoint;
  readonly maxDistanceKm?: number;
  readonly conventionnement?: Conventionnement;
  readonly limit?: number;
};

export type DirectorySearchResult = {
  readonly practitioners: readonly Practitioner[];
  readonly source: DirectorySource;
};
