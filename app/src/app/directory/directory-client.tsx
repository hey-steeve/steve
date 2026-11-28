"use client";

import { filterAndRankPractitioners, resolveSpecialty, validateDirectoryQuery } from "@steve/directory";
import { conventionnements, type Conventionnement, type DirectoryQuery, type Practitioner } from "@steve/shared";
import Link from "next/link";
import { useState } from "react";
import { demoPractitioners, parisOrigin } from "./demo-practitioners";

// The directory matches French specialty names (Annuaire Santé). The form
// speaks English, so each English name maps to the French term it searches.
const specialtyTerms: Readonly<Record<string, string>> = {
  "General practitioner": "Médecin généraliste",
  GP: "Généraliste",
  Dermatologist: "Dermatologue",
  Ophthalmologist: "Ophtalmologue",
  Dentist: "Dentiste",
  Paediatrician: "Pédiatre",
};
const specialties = ["GP", "Dermatologist", "Ophthalmologist", "Dentist", "Paediatrician"];

function searchTerm(specialty: string): string {
  const match = Object.entries(specialtyTerms).find(([label]) => label.toLowerCase() === specialty.trim().toLowerCase());
  return match === undefined ? specialty : match[1];
}
const sectors: Record<Conventionnement, string> = {
  "secteur-1": "Sector 1",
  "secteur-2": "Sector 2",
  "secteur-2-optam": "Sector 2 OPTAM",
  "non-conventionne": "Not contracted",
};
const defaults = { specialty: "General practitioner", postalCode: "75011", maxDistanceKm: "" };
const errors = {
  "unknown-specialty": "Specialty not recognised. Try for example GP, dermatologist or dentist.",
  "invalid-query": "Invalid postcode (5 digits expected).",
};
const distanceFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export default function DirectoryClient() {
  const [fields, setFields] = useState(defaults);
  const [sector, setSector] = useState<Conventionnement>();
  const query: DirectoryQuery = {
    specialty: searchTerm(fields.specialty),
    origin: parisOrigin,
    ...(fields.postalCode.trim() ? { postalCode: fields.postalCode } : {}),
    ...(fields.maxDistanceKm ? { maxDistanceKm: Number(fields.maxDistanceKm) } : {}),
    ...(sector ? { conventionnement: sector } : {}),
  };
  const validation = validateDirectoryQuery(query);
  const error = validation.ok ? undefined : validation.reason;
  const specialtyCode = validation.ok ? validation.value.specialty.code : resolveSpecialty(searchTerm(fields.specialty))?.code;
  const results = validation.ok
    ? filterAndRankPractitioners(demoPractitioners.filter((item) => item.specialtyCode === specialtyCode), validation.value)
    : [];

  return (
    <>
      <div className="directory-panel">
        <fieldset>
          <legend>Specialty</legend>
          <input aria-label="Specialty" value={fields.specialty}
            onChange={(event) => setFields({ ...fields, specialty: event.target.value })}
            aria-invalid={error === "unknown-specialty"}
            aria-describedby={error === "unknown-specialty" ? "directory-error" : undefined} />
          <div className="directory-pills">
            {specialties.map((specialty) => (
              <button key={specialty} type="button" aria-pressed={resolveSpecialty(searchTerm(specialty))?.code === specialtyCode}
                onClick={() => setFields({ ...fields, specialty })}>{specialty}</button>
            ))}
          </div>
        </fieldset>
        <div className="directory-fields">
          <label>
            Postcode <span>(optional)</span>
            <input inputMode="numeric" autoComplete="postal-code" value={fields.postalCode}
              onChange={(event) => setFields({ ...fields, postalCode: event.target.value })}
              aria-invalid={error === "invalid-query"}
              aria-describedby={error === "invalid-query" ? "directory-error" : undefined} />
          </label>
          <label>
            Maximum distance
            <select value={fields.maxDistanceKm}
              onChange={(event) => setFields({ ...fields, maxDistanceKm: event.target.value })}>
              <option value="">Any distance</option>
              <option value="2">2 km</option>
              <option value="5">5 km</option>
              <option value="10">10 km</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Contract sector</legend>
          <div className="directory-pills">
            <button type="button" aria-pressed={sector === undefined} onClick={() => setSector(undefined)}>All</button>
            {conventionnements.map((value) => (
              <button key={value} type="button" aria-pressed={sector === value} onClick={() => setSector(value)}>
                {sectors[value]}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p id="directory-error" role="alert">{errors[error]}</p>}
      </div>
      <section aria-labelledby="directory-results" className="directory-results">
        <div className="directory-results-header">
          <h2 id="directory-results">Results</h2>
        </div>
        <div aria-live="polite">
          {validation.ok && (results.length > 0 ? (
            <ul className="directory-list">
              {results.map((item) => <PractitionerCard key={item.rpps} item={item} />)}
            </ul>
          ) : (
            <div className="directory-empty">
              <p>No practitioner found for these criteria.</p>
              <button type="button" onClick={() => {
                setFields(defaults);
                setSector(undefined);
              }}>Reset filters</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function PractitionerCard({ item }: { item: Practitioner }) {
  return (
    <li className="directory-card">
      <div className="directory-card-header">
        <div>
          <h3>{item.firstName} {item.lastName}</h3>
          <p>{item.specialtyLabel}</p>
        </div>
        {item.conventionnement && <span className="directory-badge">{sectors[item.conventionnement]}</span>}
      </div>
      <div className="directory-card-details">
        <p>{item.address.line}, {item.address.postalCode} {item.address.city}</p>
        {item.distanceKm !== undefined && <span>{distanceFormat.format(item.distanceKm)} km</span>}
      </div>
      <div className="directory-card-footer">
        <p>{item.phone}</p>
        <Link
          className="directory-book"
          href={`/booking?practitioner=${encodeURIComponent(item.rpps)}`}
        >
          Book an appointment
        </Link>
      </div>
    </li>
  );
}
