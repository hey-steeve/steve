"use client";

import { filterAndRankPractitioners, resolveSpecialty, validateDirectoryQuery } from "@steve/directory";
import { conventionnements, type Conventionnement, type DirectoryQuery, type Practitioner } from "@steve/shared";
import { useState } from "react";
import { demoPractitioners, parisOrigin } from "./demo-practitioners";

const specialties = ["Généraliste", "Dermatologue", "Ophtalmologue", "Dentiste", "Pédiatre"];
const sectors: Record<Conventionnement, string> = {
  "secteur-1": "Secteur 1",
  "secteur-2": "Secteur 2",
  "secteur-2-optam": "Secteur 2 OPTAM",
  "non-conventionne": "Non conventionné",
};
const defaults = { specialty: "Médecin généraliste", postalCode: "75011", maxDistanceKm: "" };
const errors = {
  "unknown-specialty": "Spécialité non reconnue. Essayez par exemple généraliste, dermatologue ou dentiste.",
  "invalid-query": "Code postal invalide (5 chiffres attendus).",
};
const distanceFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export default function DirectoryClient() {
  const [fields, setFields] = useState(defaults);
  const [sector, setSector] = useState<Conventionnement>();
  const query: DirectoryQuery = {
    specialty: fields.specialty,
    origin: parisOrigin,
    ...(fields.postalCode.trim() ? { postalCode: fields.postalCode } : {}),
    ...(fields.maxDistanceKm ? { maxDistanceKm: Number(fields.maxDistanceKm) } : {}),
    ...(sector ? { conventionnement: sector } : {}),
  };
  const validation = validateDirectoryQuery(query);
  const error = validation.ok ? undefined : validation.reason;
  const specialtyCode = validation.ok ? validation.value.specialty.code : resolveSpecialty(fields.specialty)?.code;
  const results = validation.ok
    ? filterAndRankPractitioners(demoPractitioners.filter((item) => item.specialtyCode === specialtyCode), validation.value)
    : [];

  return (
    <>
      <div className="directory-panel">
        <fieldset>
          <legend>Spécialité</legend>
          <input aria-label="Spécialité" value={fields.specialty}
            onChange={(event) => setFields({ ...fields, specialty: event.target.value })}
            aria-invalid={error === "unknown-specialty"}
            aria-describedby={error === "unknown-specialty" ? "directory-error" : undefined} />
          <div className="directory-pills">
            {specialties.map((specialty) => (
              <button key={specialty} type="button" aria-pressed={resolveSpecialty(specialty)?.code === specialtyCode}
                onClick={() => setFields({ ...fields, specialty })}>{specialty}</button>
            ))}
          </div>
        </fieldset>
        <div className="directory-fields">
          <label>
            Code postal <span>(facultatif)</span>
            <input inputMode="numeric" autoComplete="postal-code" value={fields.postalCode}
              onChange={(event) => setFields({ ...fields, postalCode: event.target.value })}
              aria-invalid={error === "invalid-query"}
              aria-describedby={error === "invalid-query" ? "directory-error" : undefined} />
          </label>
          <label>
            Distance maximale
            <select value={fields.maxDistanceKm}
              onChange={(event) => setFields({ ...fields, maxDistanceKm: event.target.value })}>
              <option value="">Toutes distances</option>
              <option value="2">2 km</option>
              <option value="5">5 km</option>
              <option value="10">10 km</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Conventionnement</legend>
          <div className="directory-pills">
            <button type="button" aria-pressed={sector === undefined} onClick={() => setSector(undefined)}>Tous</button>
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
          <h2 id="directory-results">Résultats</h2>
          <p>Données de démonstration</p>
        </div>
        <div aria-live="polite">
          {validation.ok && (results.length > 0 ? (
            <ul className="directory-list">
              {results.map((item) => <PractitionerCard key={item.rpps} item={item} />)}
            </ul>
          ) : (
            <div className="directory-empty">
              <p>Aucun praticien trouvé pour ces critères.</p>
              <button type="button" onClick={() => {
                setFields(defaults);
                setSector(undefined);
              }}>Réinitialiser les filtres</button>
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
      <p>{item.phone}</p>
    </li>
  );
}
