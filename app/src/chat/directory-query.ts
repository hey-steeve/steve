import { conventionnements, type Conventionnement } from "@steve/shared";

export type DirectoryFilters = {
  readonly specialty: string;
  readonly postalCode: string;
  readonly conventionnement?: Conventionnement;
};

export const sectorLabels: Record<Conventionnement, string> = {
  "secteur-1": "Sector 1",
  "secteur-2": "Sector 2",
  "secteur-2-optam": "Sector 2 OPTAM",
  "non-conventionne": "Not contracted",
};

export function parseDirectoryFilters(value: unknown): DirectoryFilters | undefined {
  if (typeof value !== "object" || value === null || !("specialty" in value) || !("postalCode" in value)) {
    return;
  }
  const { specialty, postalCode } = value;
  if (
    typeof specialty !== "string" || specialty.trim() === "" || specialty.length > 80 ||
    typeof postalCode !== "string" || !/^\d{5}$/u.test(postalCode)
  ) {
    return;
  }
  const sector = "conventionnement" in value ? value.conventionnement : undefined;
  const conventionnement = conventionnements.find((entry) => entry === sector);
  if (sector !== undefined && conventionnement === undefined) return;
  return { specialty, postalCode, ...(conventionnement === undefined ? {} : { conventionnement }) };
}
