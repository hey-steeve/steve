import { describe, expect, it, vi } from "vitest";
import type { Practitioner } from "@steve/shared";
import type { PractitionerSource } from "./fhir-client.ts";
import { searchPractitioners } from "./search.ts";

const PARIS_CENTER = { lat: 48.8566, lon: 2.3522 };
const PARIS_NEAR = { lat: 48.862, lon: 2.36 };

const SAMPLE_PRACTITIONERS: readonly Practitioner[] = [
  {
    rpps: "10000000001",
    firstName: "Camille",
    lastName: "Durand",
    specialtyCode: "SM54",
    specialtyLabel: "Médecine générale",
    conventionnement: "secteur-1",
    phone: "0142000001",
    address: {
      line: "10 rue de la République",
      postalCode: "75011",
      city: "Paris",
      location: PARIS_NEAR,
    },
  },
  {
    rpps: "10000000002",
    firstName: "Lucas",
    lastName: "Martin",
    specialtyCode: "SM54",
    specialtyLabel: "Médecine générale",
    conventionnement: "secteur-2",
    phone: "0142000002",
    address: {
      line: "20 avenue Ledru-Rollin",
      postalCode: "75011",
      city: "Paris",
      location: PARIS_NEAR,
    },
  },
];

describe("searchPractitioners", () => {
  it("validates query before calling the source", async () => {
    const fetchPractitioners = vi.fn();
    const source: PractitionerSource = { fetchPractitioners };

    const result = await searchPractitioners({ specialty: "inconnu" }, { source });
    expect(result).toEqual({ ok: false, reason: "unknown-specialty" });
    expect(fetchPractitioners).not.toHaveBeenCalled();
  });

  it("filters and ranks practitioners returned by the source", async () => {
    const source: PractitionerSource = {
      fetchPractitioners: async () => ({
        ok: true,
        practitioners: SAMPLE_PRACTITIONERS,
      }),
    };

    const result = await searchPractitioners(
      {
        specialty: "généraliste",
        postalCode: "75011",
        origin: PARIS_CENTER,
        maxDistanceKm: 5,
        conventionnement: "secteur-1",
      },
      { source },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.source).toBe("annuaire-sante-fhir");
      expect(result.result.practitioners).toHaveLength(1);
      expect(result.result.practitioners[0]?.rpps).toBe("10000000001");
      expect(result.result.practitioners[0]?.distanceKm).toBeGreaterThan(0);
    }
  });

  it("propagates source failures and catches unexpected source throws as network", async () => {
    const failingSource: PractitionerSource = {
      fetchPractitioners: async () => ({ ok: false, reason: "timeout" }),
    };
    expect(await searchPractitioners({ specialty: "SM54" }, { source: failingSource })).toEqual({
      ok: false,
      reason: "timeout",
    });

    const throwingSource: PractitionerSource = {
      fetchPractitioners: async () => {
        throw new Error("boom");
      },
    };
    expect(await searchPractitioners({ specialty: "SM54" }, { source: throwingSource })).toEqual({
      ok: false,
      reason: "network",
    });
  });
});
