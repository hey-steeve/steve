import type { GeoPoint } from "@steve/shared";

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number | null {
  if (!isValidGeoPoint(a) || !isValidGeoPoint(b)) return null;

  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const clamped = Math.min(1, Math.max(0, h));
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clamped));

  return Math.round(km * 100) / 100;
}
