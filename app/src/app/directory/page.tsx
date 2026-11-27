import Link from "next/link";
import { FeatureNav, steveDisclaimer } from "../feature-shell";
import DirectoryClient from "./directory-client";
import "./directory.css";

export default function DirectoryPage() {
  return (
    <main className="directory-page">
      <header className="directory-header">
        <Link className="directory-back" href="/chat">
          <span aria-hidden="true">←</span> Retour
        </Link>
        <h1>Trouver un praticien</h1>
        <p>Annuaire Santé · recherche par spécialité, distance et secteur</p>
      </header>
      <DirectoryClient />
      <FeatureNav current="/directory" />
      <p className="steve-disclaimer">{steveDisclaimer}</p>
    </main>
  );
}
