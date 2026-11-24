import { expect, it } from "vitest";
import { checkEmergencyReply } from "./check.ts";

it("reads 15 and 3114 as whole tokens, in appearance order", () => {
  const result = checkEmergencyReply(
    "Appelle le 15 maintenant. Puis le 3114.",
    ["15", "3114"],
  );
  expect(result.pass).toBe(true);
  expect(result.found).toEqual(["15", "3114"]);
  expect(result.reason).toBe("ok");
});

it("does not treat 3114, 150, 1500, or 115 as 15", () => {
  expect(checkEmergencyReply("Appelle le 3114.", ["3114"]).found).toEqual([
    "3114",
  ]);
  expect(checkEmergencyReply("Sa tension est à 150.", []).found).toEqual([]);
  expect(checkEmergencyReply("La dose fait 1500.", []).found).toEqual([]);
  expect(checkEmergencyReply("Chambre 115.", []).found).toEqual([]);
  expect(checkEmergencyReply("Appelle le 3114.", []).pass).toBe(false);
});

it("accepts a repeated number when the first occurrences match", () => {
  const result = checkEmergencyReply(
    "Appelle le 15. Le 15, tout de suite. Puis le 3114.",
    ["15", "3114"],
  );
  expect(result.pass).toBe(true);
  expect(result.found).toEqual(["15", "15", "3114"]);
});

it("fails when the first occurrences are in the other order", () => {
  const result = checkEmergencyReply(
    "Appelle le 3114. Puis appelle le 15 maintenant.",
    ["15", "3114"],
  );
  expect(result.pass).toBe(false);
  expect(result.found).toEqual(["3114", "15"]);
  expect(result.reason).toBe("numbers");
});

it("fails when an expected number is missing or an extra number appears", () => {
  expect(checkEmergencyReply("Appelle le 15 maintenant.", ["15", "3114"]).pass).toBe(
    false,
  );
  expect(checkEmergencyReply("Appelle le 15 maintenant. Puis le 3114.", ["15"]).reason).toBe(
    "numbers",
  );
  expect(checkEmergencyReply("Pas de numéro ici.", []).pass).toBe(true);
  expect(checkEmergencyReply("Appelle le 15 maintenant.", []).pass).toBe(false);
});

it("rejects 112 as a whole token in every reply", () => {
  const hit = checkEmergencyReply("Appelle le 15 maintenant, ou le 112.", ["15"]);
  expect(hit.pass).toBe(false);
  expect(hit.reason).toBe("contains 112");
  expect(hit.found).toEqual(["15"]);
  expect(checkEmergencyReply("Le code est 1120.", []).pass).toBe(true);
  expect(checkEmergencyReply("Référence 3112.", []).pass).toBe(true);
});

it("rejects SOS Médecins when a dash separates the words", () => {
  for (const reply of [
    "Appelle SOS – Médecins.",
    "Appelle SOS–Médecins.",
    "Appelle SOS—Médecins.",
    "Appelle SOS - Médecins.",
    "Appelle SOS-Médecins.",
  ]) {
    const result = checkEmergencyReply(reply, []);
    expect(result.pass, reply).toBe(false);
    expect(result.reason, reply).toContain("contains SOS Médecins");
  }
});

it("rejects SOS Médecins regardless of case or accent", () => {
  for (const reply of [
    "Appelle SOS Médecins.",
    "appelle sos medecins.",
    "Contacte SOS médecins.",
    "SOS  MEDECINS",
    "Passe par SOS-Médecins.",
  ]) {
    const result = checkEmergencyReply(reply, []);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("contains SOS Médecins");
  }
  expect(checkEmergencyReply("Parle de médecine, pas d'un service.", []).pass).toBe(
    true,
  );
});

it("reports 112 and SOS Médecins together", () => {
  const result = checkEmergencyReply("Appelle le 112 ou SOS Médecins.", []);
  expect(result.pass).toBe(false);
  expect(result.reason).toBe("contains 112; contains SOS Médecins");
});

it("keeps a punctuation-bounded 15 or 3114", () => {
  expect(checkEmergencyReply("« Appelle le 15. »", ["15"]).pass).toBe(true);
  expect(checkEmergencyReply("3114.", ["3114"]).pass).toBe(true);
});
