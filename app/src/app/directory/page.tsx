import Link from "next/link";
import { AppTabBar } from "../tab-bar";
import DirectoryClient from "./directory-client";
import "./directory.css";

export default function DirectoryPage() {
  return (
    <main className="directory-page">
      <header className="directory-header">
        <Link className="directory-back" href="/chat">
          <span aria-hidden="true">←</span> Back
        </Link>
        <h1>Find a practitioner</h1>
        <p>Annuaire Santé · search by specialty, distance and sector</p>
      </header>
      <DirectoryClient />
      <AppTabBar current="/directory" floating />
    </main>
  );
}
