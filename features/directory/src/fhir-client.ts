import type { Conventionnement, GeoPoint, Practitioner } from "@steve/shared";
import { isValidGeoPoint } from "./distance.ts";
import type { ValidatedDirectoryQuery } from "./filter.ts";

export const ANNUAIRE_SANTE_FHIR_URL = "https://gateway.api.esante.gouv.fr/fhir/v2" as const;
export const DIRECTORY_TIMEOUT_MS = 5000 as const;
export const DIRECTORY_MAX_RESPONSE_BYTES = 1_048_576 as const;

const CONTRACTED_EXT_URL =
  "https://interop.esante.gouv.fr/ig/fhir/annuaire/StructureDefinition/as-ext-practitionerrole-contracted";
const GEOLOCATION_EXT_URL = "http://hl7.org/fhir/StructureDefinition/geolocation";
const RPPS_OID_FRAGMENT = "1.2.250.1.71.4.2.1";
const RPPS_RE = /^\d{11}$/;

export type PractitionerSourceFailureReason =
  | "missing-api-key"
  | "timeout"
  | "http"
  | "network"
  | "malformed";

export type PractitionerSourceOutcome =
  | { readonly ok: true; readonly practitioners: readonly Practitioner[] }
  | { readonly ok: false; readonly reason: PractitionerSourceFailureReason };

export type PractitionerSource = {
  readonly fetchPractitioners: (
    query: ValidatedDirectoryQuery,
  ) => Promise<PractitionerSourceOutcome>;
};

export type AnnuaireSanteConfig = {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
};

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractPhone(resource: JsonObject): string | undefined {
  for (const item of asArray(resource["telecom"])) {
    if (!isRecord(item)) continue;
    if (item["system"] === "phone") {
      const val = asString(item["value"]);
      if (val) return val;
    }
  }
  return undefined;
}

function extractConventionnement(role: JsonObject): Conventionnement | undefined {
  for (const ext of asArray(role["extension"])) {
    if (!isRecord(ext) || ext["url"] !== CONTRACTED_EXT_URL) continue;
    const concept = ext["valueCodeableConcept"];
    if (!isRecord(concept)) continue;
    for (const coding of asArray(concept["coding"])) {
      if (!isRecord(coding)) continue;
      const code = asString(coding["code"])?.toLowerCase();
      if (code === "c1" || code === "1") return "secteur-1";
      if (code === "c2" || code === "2") return "secteur-2";
      if (code === "c3" || code === "3") return "secteur-2-optam";
      if (code === "nc") return "non-conventionne";
    }
  }
  return undefined;
}

function extractGeoPoint(address: JsonObject): GeoPoint | undefined {
  for (const ext of asArray(address["extension"])) {
    if (!isRecord(ext) || ext["url"] !== GEOLOCATION_EXT_URL) continue;
    let lat: number | undefined;
    let lon: number | undefined;
    for (const sub of asArray(ext["extension"])) {
      if (!isRecord(sub)) continue;
      const value = sub["valueDecimal"];
      if (typeof value !== "number") continue;
      if (sub["url"] === "latitude") lat = value;
      if (sub["url"] === "longitude") lon = value;
    }
    if (lat !== undefined && lon !== undefined) {
      const point: GeoPoint = { lat, lon };
      if (isValidGeoPoint(point)) return point;
    }
  }
  return undefined;
}

function extractRpps(practitioner: JsonObject): string | undefined {
  for (const ident of asArray(practitioner["identifier"])) {
    if (!isRecord(ident)) continue;
    const system = asString(ident["system"])?.toLowerCase() ?? "";
    const value = asString(ident["value"]);
    if (!value || !RPPS_RE.test(value)) continue;
    if (system.includes(RPPS_OID_FRAGMENT) || system.includes("rpps")) {
      return value;
    }
  }
  return undefined;
}

function extractName(practitioner: JsonObject): { firstName: string; lastName: string } | null {
  for (const name of asArray(practitioner["name"])) {
    if (!isRecord(name)) continue;
    const lastName = asString(name["family"]);
    const given = asArray(name["given"]).map(asString).find((v) => v !== undefined);
    if (lastName && given) {
      return { firstName: given, lastName };
    }
  }
  return null;
}

function extractSpecialty(
  role: JsonObject,
  fallback: ValidatedDirectoryQuery["specialty"],
): { code: string; label: string } {
  const fields = [role["specialty"], role["code"]];
  for (const field of fields) {
    for (const concept of asArray(field)) {
      if (!isRecord(concept)) continue;
      for (const coding of asArray(concept["coding"])) {
        if (!isRecord(coding)) continue;
        const code = asString(coding["code"]);
        const label = asString(coding["display"]);
        if (code && label) return { code, label };
      }
    }
  }
  return { code: fallback.code, label: fallback.label };
}

function normalizeResourceRef(reference: string, expectedType: "Practitioner" | "Organization"): string | undefined {
  const withoutHistory = reference.replace(/\/_history\/[^/]+$/, "");
  const marker = `${expectedType}/`;
  const idx = withoutHistory.lastIndexOf(marker);
  if (idx === -1) return undefined;
  const id = withoutHistory.slice(idx + marker.length).trim();
  return id.length > 0 && !id.includes("/") ? `${expectedType}/${id}` : undefined;
}

function parseBundle(
  raw: unknown,
  query: ValidatedDirectoryQuery,
): readonly Practitioner[] | null {
  if (!isRecord(raw) || raw["resourceType"] !== "Bundle") return null;
  if (raw["entry"] !== undefined && !Array.isArray(raw["entry"])) return null;

  const entries = asArray(raw["entry"]);
  const practitionersByRef = new Map<string, JsonObject>();
  const orgsByRef = new Map<string, JsonObject>();
  const roles: JsonObject[] = [];

  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry["resource"])) continue;
    const res = entry["resource"];
    const type = asString(res["resourceType"]);
    const id = asString(res["id"]);
    if (type === "Practitioner" && id) {
      practitionersByRef.set(`Practitioner/${id}`, res);
    } else if (type === "Organization" && id) {
      orgsByRef.set(`Organization/${id}`, res);
    } else if (type === "PractitionerRole") {
      roles.push(res);
    }
  }

  const results: Practitioner[] = [];
  for (const role of roles) {
    const rawPracRef = isRecord(role["practitioner"]) ? asString(role["practitioner"]["reference"]) : undefined;
    const rawOrgRef = isRecord(role["organization"]) ? asString(role["organization"]["reference"]) : undefined;
    const pracRef = rawPracRef ? normalizeResourceRef(rawPracRef, "Practitioner") : undefined;
    const orgRef = rawOrgRef ? normalizeResourceRef(rawOrgRef, "Organization") : undefined;
    if (!pracRef || !orgRef) continue;

    const pracRes = practitionersByRef.get(pracRef);
    const orgRes = orgsByRef.get(orgRef);
    if (!pracRes || !orgRes) continue;

    const rpps = extractRpps(pracRes);
    const name = extractName(pracRes);
    if (!rpps || !name) continue;

    const addrRaw = asArray(orgRes["address"]).find(isRecord);
    if (!addrRaw) continue;
    const postalCode = asString(addrRaw["postalCode"]);
    const city = asString(addrRaw["city"]);
    if (!postalCode || !city) continue;

    const line = asArray(addrRaw["line"]).map(asString).find((v) => v !== undefined);
    const location = extractGeoPoint(addrRaw);
    const phone = extractPhone(role) ?? extractPhone(orgRes);
    const conventionnement = extractConventionnement(role);
    const specialty = extractSpecialty(role, query.specialty);

    results.push({
      rpps,
      firstName: name.firstName,
      lastName: name.lastName,
      specialtyCode: specialty.code,
      specialtyLabel: specialty.label,
      ...(conventionnement !== undefined ? { conventionnement } : {}),
      ...(phone !== undefined ? { phone } : {}),
      address: {
        ...(line !== undefined ? { line } : {}),
        postalCode,
        city,
        ...(location !== undefined ? { location } : {}),
      },
    });
  }

  return results;
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; reason: "timeout" | "malformed" | "network" }> {
  if (!response.body) {
    const textPromise = response.text();
    textPromise.catch(() => undefined);
    const text = await textPromise;
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      return { ok: false, reason: "malformed" };
    }
    return { ok: true, text };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    for (;;) {
      if (signal.aborted) {
        reader.cancel().catch(() => undefined);
        return { ok: false, reason: "timeout" };
      }
      const readPromise = reader.read();
      readPromise.catch(() => undefined);
      const step = await new Promise<Awaited<ReturnType<typeof reader.read>> | "aborted">(
        (resolve, reject) => {
          if (signal.aborted) {
            resolve("aborted");
            return;
          }
          const abortHandler = () => resolve("aborted");
          signal.addEventListener("abort", abortHandler, { once: true });
          readPromise.then(
            (res) => {
              signal.removeEventListener("abort", abortHandler);
              resolve(res);
            },
            (err: unknown) => {
              signal.removeEventListener("abort", abortHandler);
              reject(err);
            },
          );
        },
      );

      if (step === "aborted") {
        return { ok: false, reason: "timeout" };
      }
      if (step.done) break;
      totalBytes += step.value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel().catch(() => undefined);
        return { ok: false, reason: "malformed" };
      }
      chunks.push(step.value);
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, text: new TextDecoder().decode(merged) };
  } catch {
    return { ok: false, reason: signal.aborted ? "timeout" : "network" };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export function createAnnuaireSanteClient(config: AnnuaireSanteConfig): PractitionerSource {
  const apiKey = config.apiKey.trim();
  const baseUrl = (config.baseUrl ?? ANNUAIRE_SANTE_FHIR_URL).replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? DIRECTORY_TIMEOUT_MS;
  const fetchFn = config.fetch ?? globalThis.fetch;

  return {
    async fetchPractitioners(query: ValidatedDirectoryQuery): Promise<PractitionerSourceOutcome> {
      if (apiKey.length === 0) {
        return { ok: false, reason: "missing-api-key" };
      }

      const params = new URLSearchParams();
      params.set("active", "true");
      params.append("_include", "PractitionerRole:practitioner");
      params.append("_include", "PractitionerRole:organization");
      params.set("_count", String(Math.min(query.limit * 2, 100)));

      if (query.specialty.kind === "specialty") {
        params.set("specialty", query.specialty.code);
      } else {
        params.set("role", query.specialty.code);
      }

      if (query.postalCode !== undefined) {
        params.set("organization.address-postalcode", query.postalCode);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchFn(`${baseUrl}/PractitionerRole?${params.toString()}`, {
          method: "GET",
          headers: {
            Accept: "application/fhir+json",
            "ESANTE-API-KEY": apiKey,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          response.body?.cancel().catch(() => undefined);
          return { ok: false, reason: "http" };
        }

        const body = await readBoundedText(response, DIRECTORY_MAX_RESPONSE_BYTES, controller.signal);
        if (!body.ok) {
          return body;
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(body.text);
        } catch {
          return { ok: false, reason: "malformed" };
        }

        const practitioners = parseBundle(parsedJson, query);
        if (practitioners === null) {
          return { ok: false, reason: "malformed" };
        }

        return { ok: true, practitioners };
      } catch {
        return { ok: false, reason: controller.signal.aborted ? "timeout" : "network" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
