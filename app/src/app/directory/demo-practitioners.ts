import type { Conventionnement, Practitioner } from "@steve/shared";

export const parisOrigin = { lat: 48.8566, lon: 2.3522 };

function practitioner(
  number: number,
  firstName: string,
  lastName: string,
  specialtyCode: string,
  specialtyLabel: string,
  conventionnement: Conventionnement,
  postalCode: string,
  lat: number,
  lon: number,
): Practitioner {
  return {
    rpps: String(10000000000 + number),
    firstName,
    lastName,
    specialtyCode,
    specialtyLabel,
    conventionnement,
    phone: `00 00 00 00 0${number}`,
    address: { line: `${number} rue des Nuages Mauves`, postalCode, city: "Paris", location: { lat, lon } },
  };
}

export const demoPractitioners: readonly Practitioner[] = [
  practitioner(1, "Camille", "Lunéval", "SM54", "General practice", "secteur-1", "75011", 48.8578, 2.369),
  practitioner(2, "Noé", "Brumelac", "SM54", "General practice", "secteur-2-optam", "75011", 48.8645, 2.38),
  practitioner(3, "Lina", "Ormelune", "SM54", "General practice", "secteur-1", "75012", 48.8404, 2.389),
  practitioner(4, "Sacha", "Clairsonge", "SM15", "Dermatology", "secteur-2", "75011", 48.859, 2.375),
  practitioner(5, "Inès", "Valbrume", "SM38", "Ophthalmology", "secteur-2-optam", "75018", 48.893, 2.35),
  practitioner(6, "Robin", "Aubenuage", "40", "Dentist", "non-conventionne", "75011", 48.863, 2.377),
  practitioner(7, "Maëlle", "Dorétoile", "SM40", "Paediatrics", "secteur-1", "75012", 48.846, 2.373),
];
