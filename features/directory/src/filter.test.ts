import { describe, expect, it } from "vitest";
import type { Practitioner } from "@steve/shared";
import {
  DEFAULT_DIRECTORY_LIMIT,
  MAX_DIRECTORY_LIMIT,
  filterAndRankPractitioners,
  validateDirectoryQuery,
} from "./filter.ts";

const PARIS_CENTER = { lat: 48.8566, lon: 2.3522 };
const PARIS_NEAR = { lat: 48.862, lon: 2.36 };
const PARIS_MID = { lat: 48.88, lon: 2.35 };
const LYON = { lat: 45.764, lon: 4.8357 };

function makePractitioner(overrides: Partial<Practitioner> = {}): Practitioner {
  return {
    rpps: "10000000001",
    firstName: "Camille",
    lastName: "Durand",
    specialtyCode: "SM54",
    specialtyLabel: "Médecine générale",
    address: {
      line: "10 rue de la République",
      postalCode: "75011",
      city: "Paris",
      location: PARIS_NEAR,
    },
    ...overrides,
  };
}

describe("validateDirectoryQuery", () => {
  it("normalizes a valid query and applies the default limit", () => {
    const result = validateDirectoryQuery({
      specialty: "  Généraliste ",
      postalCode: " 75011 ",
      conventionnement: "secteur-1",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        specialty: {
          code: "SM54",
          label: "Médecine générale",
          kind: "specialty",
        },
        postalCode: "75011",
        conventionnement: "secteur-1",
        limit: DEFAULT_DIRECTORY_LIMIT,
      },
    });
  });

  it("caps limit at MAX_DIRECTORY_LIMIT", () => {
    const result = validateDirectoryQuery({
      specialty: "SM54",
      limit: MAX_DIRECTORY_LIMIT + 100,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.limit).toBe(MAX_DIRECTORY_LIMIT);
    }
  });

  it("rejects unknown specialties", () => {
    expect(validateDirectoryQuery({ specialty: "chaman" })).toEqual({
      ok: false,
      reason: "unknown-specialty",
    });
  });

  it("rejects invalid postal codes, limits, origins, and maxDistanceKm without origin", () => {
    expect(validateDirectoryQuery({ specialty: "SM54", postalCode: "7501" })).toEqual({
      ok: false,
      reason: "invalid-query",
    });
    expect(validateDirectoryQuery({ specialty: "SM54", limit: 0 })).toEqual({
      ok: false,
      reason: "invalid-query",
    });
    expect(validateDirectoryQuery({ specialty: "SM54", limit: 2.5 })).toEqual({
      ok: false,
      reason: "invalid-query",
    });
    expect(validateDirectoryQuery({ specialty: "SM54", maxDistanceKm: 5 })).toEqual({
      ok: false,
      reason: "invalid-query",
    });
    expect(
      validateDirectoryQuery({
        specialty: "SM54",
        origin: { lat: 95, lon: 2 },
        maxDistanceKm: 5,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-query",
    });
    expect(
      validateDirectoryQuery({
        specialty: "SM54",
        origin: PARIS_CENTER,
        maxDistanceKm: 0,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-query",
    });
    expect(
      validateDirectoryQuery({
        specialty: "SM54",
        origin: PARIS_CENTER,
        maxDistanceKm: 501,
      }),
    ).toEqual({
      ok: false,
      reason: "invalid-query",
    });
  });
});

describe("filterAndRankPractitioners", () => {
  it("filters by conventionnement and excludes practitioners with missing conventionnement", () => {
    const query = validateDirectoryQuery({
      specialty: "SM54",
      conventionnement: "secteur-1",
    });
    if (!query.ok) throw new Error("expected valid query");

    const list: Practitioner[] = [
      makePractitioner({ rpps: "10000000001", conventionnement: "secteur-1" }),
      makePractitioner({ rpps: "10000000002", conventionnement: "secteur-2" }),
      makePractitioner({ rpps: "10000000003" }),
    ];

    const ranked = filterAndRankPractitioners(list, query.value);
    expect(ranked.map((p) => p.rpps)).toEqual(["10000000001"]);
  });

  it("computes distanceKm, filters by maxDistanceKm, and excludes practitioners without location", () => {
    const query = validateDirectoryQuery({
      specialty: "SM54",
      origin: PARIS_CENTER,
      maxDistanceKm: 5,
    });
    if (!query.ok) throw new Error("expected valid query");

    const near = makePractitioner({
      rpps: "10000000001",
      address: { postalCode: "75011", city: "Paris", location: PARIS_NEAR },
    });
    const mid = makePractitioner({
      rpps: "10000000002",
      address: { postalCode: "75018", city: "Paris", location: PARIS_MID },
    });
    const far = makePractitioner({
      rpps: "10000000003",
      address: { postalCode: "69001", city: "Lyon", location: LYON },
    });
    const noLocation = makePractitioner({
      rpps: "10000000004",
      address: { postalCode: "75011", city: "Paris" },
    });

    const ranked = filterAndRankPractitioners([far, mid, noLocation, near], query.value);
    expect(ranked.map((p) => p.rpps)).toEqual(["10000000001", "10000000002"]);
    expect(ranked[0]?.distanceKm).toBeLessThan(ranked[1]?.distanceKm ?? 0);
  });

  it("deduplicates by RPPS and address, keeping the richer record", () => {
    const query = validateDirectoryQuery({ specialty: "SM54" });
    if (!query.ok) throw new Error("expected valid query");

    const sparse = makePractitioner({
      rpps: "10000000001",
      address: { line: "10 Rue de la Republique", postalCode: "75011", city: "Paris" },
    });
    const rich = makePractitioner({
      rpps: "10000000001",
      phone: "0142000001",
      conventionnement: "secteur-1",
      address: {
        line: "10 rue de la République",
        postalCode: "75011",
        city: "Paris",
        location: PARIS_NEAR,
      },
    });

    const ranked = filterAndRankPractitioners([sparse, rich], query.value);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.phone).toBe("0142000001");
    expect(ranked[0]?.conventionnement).toBe("secteur-1");
  });

  it("sorts deterministically by distance, lastName, firstName, rpps and applies limit", () => {
    const query = validateDirectoryQuery({
      specialty: "SM54",
      origin: PARIS_CENTER,
      limit: 3,
    });
    if (!query.ok) throw new Error("expected valid query");

    const list: Practitioner[] = [
      makePractitioner({
        rpps: "10000000004",
        lastName: "Bernard",
        firstName: "Zoé",
        address: { postalCode: "75011", city: "Paris" },
      }),
      makePractitioner({
        rpps: "10000000003",
        lastName: "Martin",
        firstName: "Alice",
        address: { postalCode: "75011", city: "Paris", location: PARIS_MID },
      }),
      makePractitioner({
        rpps: "10000000002",
        lastName: "Durand",
        firstName: "Camille",
        address: { postalCode: "75011", city: "Paris", location: PARIS_NEAR },
      }),
      makePractitioner({
        rpps: "10000000001",
        lastName: "Bernard",
        firstName: "Alice",
        address: { postalCode: "75011", city: "Paris", location: PARIS_NEAR },
      }),
    ];

    const ranked = filterAndRankPractitioners(list, query.value);
    expect(ranked.map((p) => p.rpps)).toEqual([
      "10000000001",
      "10000000002",
      "10000000003",
    ]);
  });

  it("filters by postalCode, merges complementary fields on dedup, and strips stale distanceKm", () => {
    const query = validateDirectoryQuery({
      specialty: "SM54",
      postalCode: "75011",
    });
    if (!query.ok) throw new Error("expected valid query");

    const withPhone = makePractitioner({
      rpps: "10000000001",
      phone: "0142000001",
      distanceKm: 1.5,
      address: { line: "10 rue Jean-Jaurès", postalCode: "75011", city: "Paris" },
    });
    const withConvention = makePractitioner({
      rpps: "10000000001",
      conventionnement: "secteur-1",
      address: { line: "10 rue Jean Jaures", postalCode: "75011", city: "Paris" },
    });
    const wrongPostal = makePractitioner({
      rpps: "10000000002",
      address: { postalCode: "75012", city: "Paris" },
    });

    const ranked = filterAndRankPractitioners([withPhone, withConvention, wrongPostal], query.value);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.phone).toBe("0142000001");
    expect(ranked[0]?.conventionnement).toBe("secteur-1");
    expect(ranked[0]?.distanceKm).toBeUndefined();
  });
});
