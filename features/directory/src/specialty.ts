export type SpecialtyKind = "specialty" | "profession";

export type SpecialtyMatch = {
  readonly code: string;
  readonly label: string;
  readonly kind: SpecialtyKind;
};

type SpecialtyEntry = SpecialtyMatch & {
  readonly aliases: readonly string[];
};

const SPECIALTY_TABLE: readonly SpecialtyEntry[] = [
  {
    code: "SM54",
    label: "Médecine générale",
    kind: "specialty",
    aliases: ["medecine generale", "medecin generaliste", "generaliste", "mg"],
  },
  {
    code: "SM15",
    label: "Dermatologie et vénéréologie",
    kind: "specialty",
    aliases: ["dermatologie", "dermatologie et venereologie", "dermatologue", "dermato"],
  },
  {
    code: "SM38",
    label: "Ophtalmologie",
    kind: "specialty",
    aliases: ["ophtalmologie", "ophtalmologue", "ophtalmo"],
  },
  {
    code: "SM04",
    label: "Cardiologie et maladies vasculaires",
    kind: "specialty",
    aliases: ["cardiologie", "cardiologie et maladies vasculaires", "cardiologue", "cardio"],
  },
  {
    code: "SM40",
    label: "Pédiatrie",
    kind: "specialty",
    aliases: ["pediatrie", "pediatre"],
  },
  {
    code: "SM19",
    label: "Gynécologie médicale",
    kind: "specialty",
    aliases: ["gynecologie", "gynecologie medicale", "gynecologue", "gyneco"],
  },
  {
    code: "SM42",
    label: "Psychiatrie",
    kind: "specialty",
    aliases: ["psychiatrie", "psychiatre", "psy"],
  },
  {
    code: "SM39",
    label: "Oto-rhino-laryngologie",
    kind: "specialty",
    aliases: ["oto rhino laryngologie", "orl"],
  },
  {
    code: "SM48",
    label: "Rhumatologie",
    kind: "specialty",
    aliases: ["rhumatologie", "rhumatologue", "rhumato"],
  },
  {
    code: "SM32",
    label: "Neurologie",
    kind: "specialty",
    aliases: ["neurologie", "neurologue"],
  },
  {
    code: "SM24",
    label: "Gastro-entérologie et hépatologie",
    kind: "specialty",
    aliases: [
      "gastro enterologie",
      "gastro enterologie et hepatologie",
      "gastro enterologue",
      "gastro",
    ],
  },
  {
    code: "SM41",
    label: "Pneumologie",
    kind: "specialty",
    aliases: ["pneumologie", "pneumologue"],
  },
  {
    code: "SM17",
    label: "Endocrinologie-diabétologie-nutrition",
    kind: "specialty",
    aliases: ["endocrinologie", "endocrinologue", "diabetologue"],
  },
  {
    code: "SM53",
    label: "Chirurgie orthopédique et traumatologie",
    kind: "specialty",
    aliases: ["orthopedie", "orthopediste", "chirurgie orthopedique"],
  },
  {
    code: "SM57",
    label: "Urologie",
    kind: "specialty",
    aliases: ["urologie", "urologue"],
  },
  {
    code: "40",
    label: "Chirurgien-dentiste",
    kind: "profession",
    aliases: ["chirurgien dentiste", "dentiste"],
  },
  {
    code: "50",
    label: "Sage-femme",
    kind: "profession",
    aliases: ["sage femme"],
  },
  {
    code: "70",
    label: "Masseur-kinésithérapeute",
    kind: "profession",
    aliases: ["masseur kinesitherapeute", "kinesitherapeute", "kine"],
  },
  {
    code: "60",
    label: "Infirmier",
    kind: "profession",
    aliases: ["infirmier", "infirmiere"],
  },
];

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-'’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LOOKUP = new Map<string, SpecialtyMatch>();

for (const entry of SPECIALTY_TABLE) {
  const match: SpecialtyMatch = {
    code: entry.code,
    label: entry.label,
    kind: entry.kind,
  };
  LOOKUP.set(normalizeKey(entry.code), match);
  LOOKUP.set(normalizeKey(entry.label), match);
  for (const alias of entry.aliases) {
    LOOKUP.set(normalizeKey(alias), match);
  }
}

export function resolveSpecialty(input: string): SpecialtyMatch | null {
  const key = normalizeKey(input);
  if (key.length === 0) return null;
  return LOOKUP.get(key) ?? null;
}
