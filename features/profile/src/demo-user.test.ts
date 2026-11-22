import {
  type DeclaredEntry,
  demoPatientMemorySeed,
  loadDemoPatientMemory,
  parsePatientMemory,
  PatientMemoryParseError,
} from "./index.ts";
import { expect, it } from "vitest";

const asOf = "2026-11-22";

const kneeNote =
  "Douleur du genou droit depuis le 12 janvier 2026, apparue après une course. Le 20 janvier 2026, le médecin traitant a noté : « douleur du genou droit depuis le 12 janvier 2026, après une course ». Il a prescrit une radio du genou. Radio du genou faite le 27 janvier 2026.";

const waitBand: Record<string, readonly [number, number]> = {
  "médecin traitant": [2, 21],
  "chirurgien-dentiste": [14, 90],
  ophtalmologue: [60, 240],
  radiologue: [2, 21],
  pédiatre: [3, 28],
};

const expected = {
  demo: true,
  asOf,
  identity: {
    givenName: "Peter",
    familyName: "Parker",
    birthDate: "1994-04-07",
    ageYears: 32,
    situation: "Parent d'un enfant, en activité.",
    children: [
      {
        givenName: "Lina",
        birthDate: "2022-06-03",
        ageYears: 4,
      },
    ],
  },
  declaredHistory: [
    { kind: "note", text: kneeNote },
    {
      kind: "visit",
      specialty: "ophtalmologue",
      practitioner: {
        name: "Céleste Vandroux",
        practice: "Cabinet d'ophtalmologie des Nénuphars-Clos",
        identifier: "DEMO-RPPS-0003",
        address: "42 avenue des Nénuphars-Clos, 92100 Boulogne-Billancourt",
      },
      requestedOn: "2025-06-03",
      seenOn: "2025-10-22",
      waitDays: 141,
      reason: "Contrôle de la vue",
    },
    {
      kind: "visit",
      specialty: "chirurgien-dentiste",
      practitioner: {
        name: "Basile Hortemel",
        practice: "Cabinet dentaire des Ateliers-Calmes",
        identifier: "DEMO-RPPS-0002",
        address: "6 impasse des Ateliers-Calmes, 75012 Paris",
      },
      requestedOn: "2025-10-14",
      seenOn: "2025-11-18",
      waitDays: 35,
      reason: "Contrôle dentaire",
    },
    {
      kind: "visit",
      specialty: "médecin traitant",
      practitioner: {
        name: "Nadège Quillien",
        practice: "Cabinet médical des Mésanges-Grises",
        identifier: "DEMO-RPPS-0001",
        address: "18 rue des Mésanges-Grises, 75011 Paris",
      },
      requestedOn: "2026-01-12",
      seenOn: "2026-01-20",
      waitDays: 8,
      reason: "Douleur du genou droit",
    },
    {
      kind: "visit",
      specialty: "radiologue",
      practitioner: {
        name: "Maël Kervadec",
        practice: "Cabinet de radiologie des Cerisiers-Muets",
        identifier: "DEMO-RPPS-0004",
        address: "9 place des Cerisiers-Muets, 75010 Paris",
      },
      requestedOn: "2026-01-20",
      seenOn: "2026-01-27",
      waitDays: 7,
      reason: "Radio du genou",
    },
    {
      kind: "visit",
      specialty: "pédiatre",
      practitioner: {
        name: "Aurore Plumecocq",
        practice: "Cabinet de pédiatrie du Pont-aux-Lavandes",
        identifier: "DEMO-RPPS-0005",
        address: "15 rue du Pont-aux-Lavandes, 75020 Paris",
      },
      requestedOn: "2026-02-02",
      seenOn: "2026-02-16",
      waitDays: 14,
      reason: "Visite de suivi pour Lina",
    },
  ],
  preferences: [
    "Créneaux après 18 h en semaine, ou le samedi matin.",
    "Prévenir la veille si le rendez-vous est en journée.",
  ],
  callHistory: [],
};

const realIdentifier =
  /[^\s@]+@[^\s@]+\.[^\s@]+|(?:\+33|0033|0)[\s.]?[1-9](?:[\s.]?\d{2}){4}|\d{9,}|https?:\/\/|www\./i;

const forbiddenKey =
  /vault|document|fichier|storage|file|url|phone|email|courriel|téléphone|telephone|rpps|adeli|finess|nir|sécu|secu/i;

const interpretation =
  /ménisque|entorse|arthrose|fracture|diagnostic|suspicion|bénin|bénigne|compte[- ]rendu|pas d'anomalie|\bnormale?\b/i;

function isNote(
  entry: DeclaredEntry,
): entry is Extract<DeclaredEntry, { kind: "note" }> {
  return entry.kind === "note";
}

function isVisit(
  entry: DeclaredEntry,
): entry is Extract<DeclaredEntry, { kind: "visit" }> {
  return entry.kind === "visit";
}

function calendarDays(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  if (
    startYear === undefined ||
    startMonth === undefined ||
    startDay === undefined ||
    endYear === undefined ||
    endMonth === undefined ||
    endDay === undefined
  ) {
    throw new Error(`bad date: ${start} ${end}`);
  }
  return (
    (Date.UTC(endYear, endMonth - 1, endDay) -
      Date.UTC(startYear, startMonth - 1, startDay)) /
    86_400_000
  );
}

function completedYears(birthDate: string, on: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [onYear, onMonth, onDay] = on.split("-").map(Number);
  if (
    birthYear === undefined ||
    birthMonth === undefined ||
    birthDay === undefined ||
    onYear === undefined ||
    onMonth === undefined ||
    onDay === undefined
  ) {
    throw new Error(`bad date: ${birthDate} ${on}`);
  }
  let age = onYear - birthYear;
  if (onMonth < birthMonth || (onMonth === birthMonth && onDay < birthDay)) {
    age -= 1;
  }
  return age;
}

function walk(
  value: unknown,
  visit: (path: string, key: string, text: string) => void,
  path = "",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, visit, `${path}[${index}]`);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const next = path === "" ? key : `${path}.${key}`;
      if (typeof child === "string") {
        visit(next, key, child);
      } else {
        walk(child, visit, next);
      }
    }
  }
}

it("loads the demo memory for Peter Parker", () => {
  expect(loadDemoPatientMemory()).toEqual(expected);
  expect(parsePatientMemory(demoPatientMemorySeed)).toEqual(expected);
});

it("records ages and past waits as declared facts", () => {
  const memory = loadDemoPatientMemory();
  expect(memory.demo).toBe(true);
  expect(memory.asOf).toBe(asOf);
  expect(memory.identity.ageYears).toBe(
    completedYears(memory.identity.birthDate, memory.asOf),
  );
  expect(memory.identity.children).toHaveLength(1);
  const child = memory.identity.children[0];
  if (child === undefined) {
    throw new Error("missing child");
  }
  expect(child.givenName).toBe("Lina");
  expect(child.ageYears).toBe(completedYears(child.birthDate, memory.asOf));

  const visits = memory.declaredHistory.filter(isVisit);
  expect(visits.map((visit) => visit.specialty).sort()).toEqual(
    Object.keys(waitBand).sort(),
  );
  for (const visit of visits) {
    expect(visit.requestedOn <= visit.seenOn).toBe(true);
    expect(visit.seenOn < memory.asOf).toBe(true);
    expect(visit.seenOn >= "2025-01-01").toBe(true);
    expect(visit.requestedOn <= "2026-12-31").toBe(true);
    expect(calendarDays(visit.requestedOn, visit.seenOn)).toBe(visit.waitDays);
    const band = waitBand[visit.specialty];
    if (band === undefined) {
      throw new Error(`missing wait band for ${visit.specialty}`);
    }
    expect(visit.waitDays).toBeGreaterThanOrEqual(band[0]);
    expect(visit.waitDays).toBeLessThanOrEqual(band[1]);
  }
});

it("keeps the knee X-ray as a history sentence", () => {
  const memory = loadDemoPatientMemory();
  const notes = memory.declaredHistory.filter(isNote);
  expect(notes.map((note) => note.text).join("\n")).toContain(
    "Radio du genou faite le 27 janvier 2026",
  );
  expect(notes.map((note) => note.text).join("\n")).toContain(
    "le médecin traitant a noté",
  );
  expect(notes.map((note) => note.text).join("\n")).toContain(
    "prescrit une radio du genou",
  );
  const imaging = memory.declaredHistory
    .filter(isVisit)
    .find((visit) => visit.specialty === "radiologue");
  expect(imaging?.reason).toBe("Radio du genou");
  expect(JSON.stringify(memory)).not.toMatch(
    /vault|document|compte[- ]rendu|fichier/i,
  );
});

it("marks the fixture as demo and carries no real identifier", () => {
  const memory = loadDemoPatientMemory();
  expect(memory.demo).toBe(true);
  const identifiers: string[] = [];
  walk(memory, (path, key, text) => {
    expect(text, path).not.toMatch(realIdentifier);
    expect(text, path).not.toMatch(interpretation);
    expect(key, path).not.toMatch(forbiddenKey);
    if (key === "identifier") {
      expect(text).toMatch(/^DEMO-RPPS-\d{4}$/);
      identifiers.push(text);
    }
  });
  expect(identifiers).toHaveLength(5);
  expect(new Set(identifiers).size).toBe(identifiers.length);
});

it("rejects a record that is not demo or that looks real", () => {
  expect(PatientMemoryParseError).toBeTypeOf("function");
  expect(() => parsePatientMemory({ ...expected, demo: false })).toThrow(
    PatientMemoryParseError,
  );
  expect(() =>
    parsePatientMemory({ ...expected, vault: "radio-du-genou" }),
  ).toThrow(PatientMemoryParseError);
  expect(() =>
    parsePatientMemory({
      ...expected,
      identity: { ...expected.identity, givenName: "peter@example.com" },
    }),
  ).toThrow(PatientMemoryParseError);
  expect(() =>
    parsePatientMemory({
      ...expected,
      identity: {
        ...expected.identity,
        situation: "Appeler le 01 43 00 00 00",
      },
    }),
  ).toThrow(PatientMemoryParseError);
  const history = expected.declaredHistory.map((entry) => {
    if (entry.kind !== "visit") {
      return entry;
    }
    return {
      ...entry,
      practitioner: { ...entry.practitioner, identifier: "10100229821" },
    };
  });
  expect(() =>
    parsePatientMemory({ ...expected, declaredHistory: history }),
  ).toThrow(PatientMemoryParseError);
  const onDemoDay = expected.declaredHistory.map((entry) => {
    if (entry.kind !== "visit" || entry.specialty !== "radiologue") {
      return entry;
    }
    return { ...entry, requestedOn: asOf, seenOn: asOf, waitDays: 0 };
  });
  expect(() =>
    parsePatientMemory({ ...expected, declaredHistory: onDemoDay }),
  ).toThrow(PatientMemoryParseError);
  const shifted = expected.declaredHistory.map((entry) => {
    if (entry.kind !== "visit" || entry.specialty !== "radiologue") {
      return entry;
    }
    return { ...entry, waitDays: entry.waitDays + 1 };
  });
  expect(() =>
    parsePatientMemory({ ...expected, declaredHistory: shifted }),
  ).toThrow(PatientMemoryParseError);
  const duplicated = expected.declaredHistory.map((entry) => {
    if (entry.kind !== "visit") {
      return entry;
    }
    return {
      ...entry,
      practitioner: { ...entry.practitioner, identifier: "DEMO-RPPS-0001" },
    };
  });
  expect(() =>
    parsePatientMemory({ ...expected, declaredHistory: duplicated }),
  ).toThrow(PatientMemoryParseError);
});

it("reads a declared call back unchanged", () => {
  const call = {
    at: "2026-01-20",
    direction: "in" as const,
    summary: "Appel pour la douleur du genou.",
  };
  expect(
    parsePatientMemory({ ...expected, callHistory: [call] }).callHistory,
  ).toEqual([call]);
  expect(() =>
    parsePatientMemory({
      ...expected,
      callHistory: [{ ...call, at: asOf }],
    }),
  ).toThrow(PatientMemoryParseError);
  expect(() =>
    parsePatientMemory({
      ...expected,
      callHistory: [{ ...call, direction: "sideways" }],
    }),
  ).toThrow(PatientMemoryParseError);
});

it("returns a fresh memory on each load", () => {
  expect(loadDemoPatientMemory()).toEqual(loadDemoPatientMemory());
  expect(loadDemoPatientMemory()).not.toBe(loadDemoPatientMemory());
});
