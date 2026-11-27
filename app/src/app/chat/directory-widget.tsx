import type { Practitioner } from "@steve/shared";
import Link from "next/link";
import { sectorLabels, type DirectoryFilters } from "../../chat/directory-query";

type SearchActivity = "searching" | "done" | "failed";
const activityLabel: Record<SearchActivity, string> = {
  searching: "Recherche en cours",
  done: "Voir les étapes de recherche",
  failed: "Recherche interrompue",
};

export function DirectoryActivity({ filters, status }: {
  readonly filters: DirectoryFilters;
  readonly status: SearchActivity;
}) {
  return (
    <details className="chat-directory-activity" open={status === "searching"}>
      <summary>
        <span aria-hidden="true">{status === "searching" ? "◌" : status === "done" ? "✓" : "!"}</span>
        {activityLabel[status]}
      </summary>
      <div>
        {status === "searching" && <p>Je sors ma loupe.</p>}
        <ol>
          <li>
            <strong>Critères reçus</strong>
            <span>{criteriaText(filters)}</span>
          </li>
          <li>{status === "failed" ? "L’annuaire est indisponible." : "Recherche dans l’annuaire"}</li>
        </ol>
      </div>
    </details>
  );
}

const distanceFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function DirectoryWidget({ filters, practitioners, demo, onRefine }: {
  readonly filters: DirectoryFilters;
  readonly practitioners: readonly Practitioner[];
  readonly demo: boolean;
  readonly onRefine?: (() => void) | undefined;
}) {
  return (
    <>
      <section className="chat-directory-widget" aria-label="Résultats de recherche">
        <h2>{filters.specialty}</h2>
        <p>{placeAndSector(filters)}</p>
        {practitioners.length > 0 && (
          <ul>
            {practitioners.map(({ rpps, firstName, lastName, address, conventionnement, distanceKm, phone }) => (
              <li key={JSON.stringify([rpps, address.postalCode, address.line])}>
                <details>
                  <summary>
                    <strong>{firstName} {lastName}</strong>
                    <span>{[
                      address.city,
                      distanceKm === undefined ? undefined : `${distanceFormat.format(distanceKm)} km`,
                      conventionnement && sectorLabels[conventionnement],
                    ].filter(Boolean).join(" · ")}</span>
                  </summary>
                  <p>{[address.line, `${address.postalCode} ${address.city}`].filter(Boolean).join(", ")}</p>
                  {!demo && phone && <p>{phone}</p>}
                  <Link
                    className="chat-directory-book"
                    href={`/booking?practitioner=${encodeURIComponent(rpps)}`}
                  >
                    Prendre rendez-vous
                  </Link>
                </details>
              </li>
            ))}
          </ul>
        )}
        {onRefine && <button type="button" onClick={onRefine}>Affiner la recherche</button>}
      </section>
      <p className="chat-directory-source">{demo ? "Données de démonstration" : "Source : Annuaire Santé"}</p>
    </>
  );
}

function criteriaText({ specialty, postalCode, conventionnement }: DirectoryFilters): string {
  return `${specialty} · ${placeAndSector({ postalCode, conventionnement })}`;
}

function placeAndSector({ postalCode, conventionnement }: {
  readonly postalCode: string;
  readonly conventionnement?: Practitioner["conventionnement"];
}): string {
  return conventionnement === undefined ? postalCode : `${postalCode} · ${sectorLabels[conventionnement]}`;
}
