import { describe, expect, it, vi } from "vitest";
import { validateDirectoryQuery } from "./filter.ts";
import {
  ANNUAIRE_SANTE_FHIR_URL,
  DIRECTORY_MAX_RESPONSE_BYTES,
  createAnnuaireSanteClient,
} from "./fhir-client.ts";

function makeValidQuery(specialty = "généraliste", postalCode?: string) {
  const result = validateDirectoryQuery({
    specialty,
    ...(postalCode !== undefined ? { postalCode } : {}),
  });
  if (!result.ok) throw new Error("expected valid query");
  return result.value;
}

function makeFhirBundle() {
  return {
    resourceType: "Bundle",
    type: "searchset",
    entry: [
      {
        resource: {
          resourceType: "PractitionerRole",
          id: "role-1",
          practitioner: { reference: "Practitioner/prac-1" },
          organization: { reference: "Organization/org-1" },
          specialty: [
            {
              coding: [{ code: "SM54", display: "Médecine générale" }],
            },
          ],
          telecom: [{ system: "phone", value: "0142000001" }],
          extension: [
            {
              url: "https://interop.esante.gouv.fr/ig/fhir/annuaire/StructureDefinition/as-ext-practitionerrole-contracted",
              valueCodeableConcept: {
                coding: [{ code: "c1", display: "Secteur 1" }],
              },
            },
          ],
        },
      },
      {
        resource: {
          resourceType: "Practitioner",
          id: "prac-1",
          identifier: [
            { system: "urn:oid:1.2.250.1.71.4.2.1", value: "10000000001" },
          ],
          name: [{ family: "Durand", given: ["Camille"] }],
        },
      },
      {
        resource: {
          resourceType: "Organization",
          id: "org-1",
          telecom: [{ system: "phone", value: "0142000099" }],
          address: [
            {
              line: ["10 rue de la République"],
              postalCode: "75011",
              city: "Paris",
              extension: [
                {
                  url: "http://hl7.org/fhir/StructureDefinition/geolocation",
                  extension: [
                    { url: "latitude", valueDecimal: 48.862 },
                    { url: "longitude", valueDecimal: 2.36 },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

describe("createAnnuaireSanteClient", () => {
  it("returns missing-api-key without calling fetch when apiKey is blank", async () => {
    const fetchMock = vi.fn();
    const client = createAnnuaireSanteClient({ apiKey: "   ", fetch: fetchMock });
    const result = await client.fetchPractitioners(makeValidQuery());

    expect(result).toEqual({ ok: false, reason: "missing-api-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queries ANS FHIR v2 with ESANTE-API-KEY and parses PractitionerRole + included resources", async () => {
    let seenUrl = "";
    let seenKey: string | null = null;
    const fetchMock: typeof globalThis.fetch = async (input, init) => {
      seenUrl = typeof input === "string" ? input : input.toString();
      seenKey = new Headers(init?.headers).get("ESANTE-API-KEY");
      return new Response(JSON.stringify(makeFhirBundle()), {
        status: 200,
        headers: { "content-type": "application/fhir+json" },
      });
    };

    const client = createAnnuaireSanteClient({
      apiKey: "test-esante-key",
      fetch: fetchMock,
    });
    const result = await client.fetchPractitioners(makeValidQuery("généraliste", "75011"));

    expect(seenUrl.startsWith(`${ANNUAIRE_SANTE_FHIR_URL}/PractitionerRole?`)).toBe(true);
    expect(seenUrl).toContain("specialty=SM54");
    expect(seenUrl).toContain("organization.address-postalcode=75011");
    expect(seenKey).toBe("test-esante-key");

    expect(result).toEqual({
      ok: true,
      practitioners: [
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
            location: { lat: 48.862, lon: 2.36 },
          },
        },
      ],
    });
  });

  it("uses the role query parameter for TRE_G15 professions", async () => {
    let seenUrl = "";
    const fetchMock: typeof globalThis.fetch = async (input) => {
      seenUrl = typeof input === "string" ? input : input.toString();
      return new Response(JSON.stringify({ resourceType: "Bundle", entry: [] }), { status: 200 });
    };

    const client = createAnnuaireSanteClient({ apiKey: "test-key", fetch: fetchMock });
    const result = await client.fetchPractitioners(makeValidQuery("dentiste"));

    expect(seenUrl).toContain("role=40");
    expect(seenUrl).not.toContain("specialty=");
    expect(result).toEqual({ ok: true, practitioners: [] });
  });

  it("maps HTTP errors, network errors, malformed JSON, and oversized bodies cleanly", async () => {
    const httpClient = createAnnuaireSanteClient({
      apiKey: "key",
      fetch: async () => new Response("forbidden", { status: 403 }),
    });
    expect(await httpClient.fetchPractitioners(makeValidQuery())).toEqual({
      ok: false,
      reason: "http",
    });

    const netClient = createAnnuaireSanteClient({
      apiKey: "key",
      fetch: async () => {
        throw new Error("ECONNRESET");
      },
    });
    expect(await netClient.fetchPractitioners(makeValidQuery())).toEqual({
      ok: false,
      reason: "network",
    });

    const badJsonClient = createAnnuaireSanteClient({
      apiKey: "key",
      fetch: async () => new Response("{bad", { status: 200 }),
    });
    expect(await badJsonClient.fetchPractitioners(makeValidQuery())).toEqual({
      ok: false,
      reason: "malformed",
    });

    const wrongTypeClient = createAnnuaireSanteClient({
      apiKey: "key",
      fetch: async () => new Response(JSON.stringify({ resourceType: "OperationOutcome" }), { status: 200 }),
    });
    expect(await wrongTypeClient.fetchPractitioners(makeValidQuery())).toEqual({
      ok: false,
      reason: "malformed",
    });

    const oversizedClient = createAnnuaireSanteClient({
      apiKey: "key",
      fetch: async () =>
        new Response("x".repeat(DIRECTORY_MAX_RESPONSE_BYTES + 1), { status: 200 }),
    });
    expect(await oversizedClient.fetchPractitioners(makeValidQuery())).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("returns timeout on stalled fetch and absorbs late body rejections after abort (BC-05)", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const stalledClient = createAnnuaireSanteClient({
        apiKey: "key",
        timeoutMs: 15,
        fetch: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      });
      expect(await stalledClient.fetchPractitioners(makeValidQuery())).toEqual({
        ok: false,
        reason: "timeout",
      });

      const lateBodyClient = createAnnuaireSanteClient({
        apiKey: "key",
        timeoutMs: 15,
        fetch: async () => {
          const stream = new ReadableStream({
            start(controller) {
              setTimeout(() => {
                controller.error(new Error("late stream error"));
              }, 40);
            },
          });
          return new Response(stream, { status: 200 });
        },
      });
      expect(await lateBodyClient.fetchPractitioners(makeValidQuery())).toEqual({
        ok: false,
        reason: "timeout",
      });

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("handles full-URL FHIR references and mid-stream read errors before timeout", async () => {
    const bundle = makeFhirBundle();
    const roleEntry = bundle.entry[0]?.resource;
    if (roleEntry && "practitioner" in roleEntry && roleEntry.practitioner) {
      roleEntry.practitioner.reference =
        "https://gateway.api.esante.gouv.fr/fhir/v2/Practitioner/prac-1/_history/2";
    }
    if (roleEntry && "organization" in roleEntry && roleEntry.organization) {
      roleEntry.organization.reference =
        "https://gateway.api.esante.gouv.fr/fhir/v2/Organization/org-1";
    }

    const fullUrlClient = createAnnuaireSanteClient({
      apiKey: "key",
      fetch: async () => new Response(JSON.stringify(bundle), { status: 200 }),
    });
    const parsed = await fullUrlClient.fetchPractitioners(makeValidQuery());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.practitioners).toHaveLength(1);
      expect(parsed.practitioners[0]?.rpps).toBe("10000000001");
    }

    const midStreamClient = createAnnuaireSanteClient({
      apiKey: "key",
      timeoutMs: 2000,
      fetch: async () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.error(new Error("connection reset mid-stream"));
          },
        });
        return new Response(stream, { status: 200 });
      },
    });
    expect(await midStreamClient.fetchPractitioners(makeValidQuery())).toEqual({
      ok: false,
      reason: "network",
    });
  });
});
