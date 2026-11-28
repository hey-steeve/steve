import { expect, it } from "vitest";
import { baseSearchEntries, groupResults, searchApp } from "./search";

it("finds pages, challenges, practitioners and documents without accents", () => {
  const entries = baseSearchEntries();
  expect(searchApp("sleep", entries).map((item) => item.title)).toEqual(["Sleep 7 × 7"]);
  expect(searchApp("luneval", entries)[0]?.title).toBe("Camille Lunéval");
  expect(searchApp("letter", entries)[0]).toMatchObject({ kind: "document", href: "/vault" });
  expect(searchApp("documents", entries)[0]?.title).toBe("Vault");
  expect(searchApp("lea", entries)[0]).toMatchObject({ kind: "friend", href: "/challenges?section=amis" });
});

it("needs every word and ranks title hits first", () => {
  const entries = baseSearchEntries();
  expect(searchApp("   ", entries)).toEqual([]);
  expect(searchApp("general paediatrics", entries)).toEqual([]);
  const general = searchApp("general practice", entries);
  expect(general.length).toBe(3);
  expect(general.every((item) => item.kind === "practitioner")).toBe(true);
  expect(searchApp("calendar", entries)[0]?.title).toBe("Calendar");
});

it("groups results by kind in a fixed order", () => {
  const groups = groupResults(searchApp("a", baseSearchEntries()));
  expect(groups.map((group) => group.kind)).toEqual(["page", "challenge", "friend", "practitioner", "document"]);
});
