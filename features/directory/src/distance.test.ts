import { describe, expect, it } from "vitest";
import { distanceKm, isValidGeoPoint } from "./distance.ts";

describe("isValidGeoPoint", () => {
  it("accepts valid coordinates including poles and antimeridian", () => {
    expect(isValidGeoPoint({ lat: 48.8566, lon: 2.3522 })).toBe(true);
    expect(isValidGeoPoint({ lat: 90, lon: 180 })).toBe(true);
    expect(isValidGeoPoint({ lat: -90, lon: -180 })).toBe(true);
    expect(isValidGeoPoint({ lat: 0, lon: 0 })).toBe(true);
  });

  it("rejects out-of-range, NaN, and infinite coordinates", () => {
    expect(isValidGeoPoint({ lat: 90.01, lon: 2.35 })).toBe(false);
    expect(isValidGeoPoint({ lat: -90.01, lon: 2.35 })).toBe(false);
    expect(isValidGeoPoint({ lat: 48.85, lon: 180.01 })).toBe(false);
    expect(isValidGeoPoint({ lat: 48.85, lon: -180.01 })).toBe(false);
    expect(isValidGeoPoint({ lat: Number.NaN, lon: 2.35 })).toBe(false);
    expect(isValidGeoPoint({ lat: 48.85, lon: Number.POSITIVE_INFINITY })).toBe(false);
  });
});

describe("distanceKm", () => {
  it("returns 0 for identical points", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    expect(distanceKm(paris, paris)).toBe(0);
  });

  it("computes the Haversine distance between Paris and Lyon within 2 km", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const lyon = { lat: 45.764, lon: 4.8357 };
    const km = distanceKm(paris, lyon);
    expect(km).not.toBeNull();
    if (km !== null) {
      expect(km).toBeGreaterThan(390);
      expect(km).toBeLessThan(395);
    }
  });

  it("returns null when either point is invalid", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    expect(distanceKm(paris, { lat: 91, lon: 2.35 })).toBeNull();
    expect(distanceKm({ lat: Number.NaN, lon: 2.35 }, paris)).toBeNull();
  });
});
