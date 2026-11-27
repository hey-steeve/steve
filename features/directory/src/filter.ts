import { conventionnements } from "@steve/shared";
import type { Conventionnement, DirectoryQuery, GeoPoint, Practitioner } from "@steve/shared";
import { distanceKm, isValidGeoPoint } from "./distance.ts";
import { resolveSpecialty } from "./specialty.ts";
import type { SpecialtyMatch } from "./specialty.ts";

export const DEFAULT_DIRECTORY_LIMIT = 10 as const;
export const MAX_DIRECTORY_LIMIT = 50 as const;
export const MAX_DISTANCE_KM = 500 as const;

const POSTAL_CODE_RE = /^\d{5}$/;

export type ValidatedDirectoryQuery = {
  readonly specialty: SpecialtyMatch;
  readonly postalCode?: string;
  readonly origin?: GeoPoint;
  readonly maxDistanceKm?: number;
  readonly conventionnement?: Conventionnement;
  readonly limit: number;
};

export type QueryValidationResult =
  | { readonly ok: true; readonly value: ValidatedDirectoryQuery }
  | { readonly ok: false; readonly reason: "invalid-query" | "unknown-specialty" };

function isConventionnement(value: unknown): value is Conventionnement {
  return (
    typeof value === "string" &&
    conventionnements.some((entry) => entry === value)
  );
}

export function validateDirectoryQuery(query: DirectoryQuery): QueryValidationResult {
  if (typeof query.specialty !== "string") {
    return { ok: false, reason: "invalid-query" };
  }

  const specialty = resolveSpecialty(query.specialty);
  if (!specialty) {
    return { ok: false, reason: "unknown-specialty" };
  }

  let postalCode: string | undefined;
  if (query.postalCode !== undefined) {
    const trimmed = query.postalCode.trim();
    if (!POSTAL_CODE_RE.test(trimmed)) {
      return { ok: false, reason: "invalid-query" };
    }
    postalCode = trimmed;
  }

  if (query.origin !== undefined && !isValidGeoPoint(query.origin)) {
    return { ok: false, reason: "invalid-query" };
  }

  if (query.maxDistanceKm !== undefined) {
    if (
      query.origin === undefined ||
      !Number.isFinite(query.maxDistanceKm) ||
      query.maxDistanceKm <= 0 ||
      query.maxDistanceKm > MAX_DISTANCE_KM
    ) {
      return { ok: false, reason: "invalid-query" };
    }
  }

  if (query.conventionnement !== undefined && !isConventionnement(query.conventionnement)) {
    return { ok: false, reason: "invalid-query" };
  }

  let limit: number = DEFAULT_DIRECTORY_LIMIT;
  if (query.limit !== undefined) {
    if (!Number.isInteger(query.limit) || query.limit < 1) {
      return { ok: false, reason: "invalid-query" };
    }
    limit = Math.min(query.limit, MAX_DIRECTORY_LIMIT);
  }

  return {
    ok: true,
    value: {
      specialty,
      ...(postalCode !== undefined ? { postalCode } : {}),
      ...(query.origin !== undefined ? { origin: query.origin } : {}),
      ...(query.maxDistanceKm !== undefined ? { maxDistanceKm: query.maxDistanceKm } : {}),
      ...(query.conventionnement !== undefined
        ? { conventionnement: query.conventionnement }
        : {}),
      limit,
    },
  };
}

function normalizeAddressPart(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-'’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergePractitioner(existing: Practitioner, incoming: Practitioner): Practitioner {
  const location =
    existing.address.location && isValidGeoPoint(existing.address.location)
      ? existing.address.location
      : incoming.address.location && isValidGeoPoint(incoming.address.location)
        ? incoming.address.location
        : undefined;
  const line = existing.address.line ?? incoming.address.line;
  const phone = existing.phone ?? incoming.phone;
  const conventionnement = existing.conventionnement ?? incoming.conventionnement;

  return {
    rpps: existing.rpps,
    firstName: existing.firstName,
    lastName: existing.lastName,
    specialtyCode: existing.specialtyCode,
    specialtyLabel: existing.specialtyLabel,
    ...(conventionnement !== undefined ? { conventionnement } : {}),
    ...(phone !== undefined ? { phone } : {}),
    address: {
      ...(line !== undefined ? { line } : {}),
      postalCode: existing.address.postalCode,
      city: existing.address.city,
      ...(location !== undefined ? { location } : {}),
    },
  };
}

function deduplicate(practitioners: readonly Practitioner[]): Practitioner[] {
  const byKey = new Map<string, Practitioner>();
  for (const item of practitioners) {
    const key = `${item.rpps}|${item.address.postalCode}|${normalizeAddressPart(item.address.line)}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergePractitioner(existing, item) : item);
  }
  return Array.from(byKey.values());
}

function stripDistance(item: Practitioner): Practitioner {
  const { distanceKm: _ignored, ...rest } = item;
  return rest;
}

function compareText(a: string, b: string): number {
  const na = normalizeAddressPart(a);
  const nb = normalizeAddressPart(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

export function filterAndRankPractitioners(
  practitioners: readonly Practitioner[],
  query: ValidatedDirectoryQuery,
): readonly Practitioner[] {
  const deduped = deduplicate(practitioners);
  const enriched: Practitioner[] = [];

  for (const item of deduped) {
    if (query.postalCode !== undefined && item.address.postalCode.trim() !== query.postalCode) {
      continue;
    }

    if (query.conventionnement !== undefined && item.conventionnement !== query.conventionnement) {
      continue;
    }

    let computedDistance: number | undefined;
    if (query.origin !== undefined && item.address.location !== undefined) {
      const km = distanceKm(query.origin, item.address.location);
      if (km !== null) {
        computedDistance = km;
      }
    }

    if (query.maxDistanceKm !== undefined) {
      if (computedDistance === undefined || computedDistance > query.maxDistanceKm) {
        continue;
      }
    }

    const base = stripDistance(item);
    enriched.push(
      computedDistance !== undefined ? { ...base, distanceKm: computedDistance } : base,
    );
  }

  enriched.sort((a, b) => {
    const aDist = a.distanceKm;
    const bDist = b.distanceKm;
    if (aDist !== undefined && bDist !== undefined && aDist !== bDist) {
      return aDist - bDist;
    }
    if ((aDist !== undefined) !== (bDist !== undefined)) {
      return aDist !== undefined ? -1 : 1;
    }

    const lastDiff = compareText(a.lastName, b.lastName);
    if (lastDiff !== 0) return lastDiff;

    const firstDiff = compareText(a.firstName, b.firstName);
    if (firstDiff !== 0) return firstDiff;

    return a.rpps < b.rpps ? -1 : a.rpps > b.rpps ? 1 : 0;
  });

  return enriched.slice(0, query.limit);
}
