import { expect, it } from "vitest";
import { baseSearchEntries, groupResults, searchApp } from "./search";

it("finds pages, challenges, practitioners and documents without accents", () => {
  const entries = baseSearchEntries();
  expect(searchApp("sommeil", entries).map((item) => item.title)).toEqual(["Sommeil 7 × 7"]);
  expect(searchApp("luneval", entries)[0]?.title).toBe("Camille Lunéval");
  expect(searchApp("lettre", entries)[0]).toMatchObject({ kind: "document", href: "/vault" });
  expect(searchApp("documents", entries)[0]?.title).toBe("Vault");
});

it("needs every word and ranks title hits first", () => {
  const entries = baseSearchEntries();
  expect(searchApp("   ", entries)).toEqual([]);
  expect(searchApp("medecine pediatrie", entries)).toEqual([]);
  const general = searchApp("médecine générale", entries);
  expect(general.length).toBe(3);
  expect(general.every((item) => item.kind === "practitioner")).toBe(true);
  expect(searchApp("agenda", entries)[0]?.title).toBe("Agenda");
});

it("groups results by kind in a fixed order", () => {
  const groups = groupResults(searchApp("a", baseSearchEntries()));
  expect(groups.map((group) => group.kind)).toEqual(["page", "challenge", "practitioner", "document"]);
});
