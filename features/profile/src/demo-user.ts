import { parsePatientMemory, type PatientMemory } from "./memory.ts";

const kneeNote =
  "Douleur du genou droit depuis le 12 janvier 2026, apparue après une course. Le 20 janvier 2026, le médecin traitant a noté : « douleur du genou droit depuis le 12 janvier 2026, après une course ». Il a prescrit une radio du genou. Radio du genou faite le 27 janvier 2026.";

export function createDemoPatientMemorySeed() {
  return {
    demo: true,
    asOf: "2026-11-22",
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
}

export function loadDemoPatientMemory(): PatientMemory {
  return parsePatientMemory(createDemoPatientMemorySeed());
}
