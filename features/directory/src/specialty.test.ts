import { describe, expect, it } from "vitest";
import { resolveSpecialty } from "./specialty.ts";

describe("resolveSpecialty", () => {
  it("resolves common French specialty names regardless of case, accents, or hyphens", () => {
    expect(resolveSpecialty("Médecin généraliste")).toEqual({
      code: "SM54",
      label: "Médecine générale",
      kind: "specialty",
    });
    expect(resolveSpecialty("generaliste")).toEqual({
      code: "SM54",
      label: "Médecine générale",
      kind: "specialty",
    });
    expect(resolveSpecialty("  Dermatologue  ")).toEqual({
      code: "SM15",
      label: "Dermatologie et vénéréologie",
      kind: "specialty",
    });
    expect(resolveSpecialty("Ophtalmo")).toEqual({
      code: "SM38",
      label: "Ophtalmologie",
      kind: "specialty",
    });
    expect(resolveSpecialty("gastro-entérologue")).toEqual({
      code: "SM24",
      label: "Gastro-entérologie et hépatologie",
      kind: "specialty",
    });
    expect(resolveSpecialty("sage femme")).toEqual({
      code: "50",
      label: "Sage-femme",
      kind: "profession",
    });
    expect(resolveSpecialty("kiné")).toEqual({
      code: "70",
      label: "Masseur-kinésithérapeute",
      kind: "profession",
    });
  });

  it("resolves canonical NOS codes case-insensitively", () => {
    expect(resolveSpecialty("SM54")).toEqual({
      code: "SM54",
      label: "Médecine générale",
      kind: "specialty",
    });
    expect(resolveSpecialty("sm15")).toEqual({
      code: "SM15",
      label: "Dermatologie et vénéréologie",
      kind: "specialty",
    });
    expect(resolveSpecialty("40")).toEqual({
      code: "40",
      label: "Chirurgien-dentiste",
      kind: "profession",
    });
  });

  it("returns null for empty, whitespace, or unknown specialties", () => {
    expect(resolveSpecialty("")).toBeNull();
    expect(resolveSpecialty("   ")).toBeNull();
    expect(resolveSpecialty("astrologue")).toBeNull();
    expect(resolveSpecialty("SM99")).toBeNull();
  });
});
