import { resolveSpecialty } from "@steve/directory";
import type { Conventionnement } from "@steve/shared";
import type { DirectoryFilters } from "../../../chat/directory-query";
import type { ChatTurn } from "../../../chat/request";

type Criteria = { specialty?: string; postalCode?: string; conventionnement?: Conventionnement };

const opening = /^(?:(?:bonjour[, ]+)?(?:peux-tu|tu peux|pourrais-tu) (?:me )?(?:trouver|chercher)|je (?:cherche|voudrais(?: trouver)?)|(?:trouve|cherche)(?:-moi)?) (?:un|une|des) (.+)$/iu;
const place = /(?:^| )(?:(?:près (?:du|de|d'un)|à|dans le|autour du|vers) )?(\d{5}|près de chez moi|dans ma ville)(?= |$)/iu;
const sectorFilter = /(?:^| )(?:(?:juste|seulement|uniquement) )?(?:en )?(secteur (?:1|2(?: optam)?)|non conventionn[ée])(?= |$)/iu;

function sectorFrom(text: string | undefined): Conventionnement | undefined {
  switch (text?.toLowerCase()) {
    case "secteur 1": return "secteur-1";
    case "secteur 2": return "secteur-2";
    case "secteur 2 optam": return "secteur-2-optam";
    case "non conventionné":
    case "non conventionne": return "non-conventionne";
    default: return undefined;
  }
}

function readCriteria(input: string, startsSearch: boolean, previous?: Criteria): Criteria | undefined {
  const postalCode = place.exec(input)?.[1];
  const conventionnement = sectorFrom(sectorFilter.exec(input)?.[1]);
  const remaining = input.replace(place, "").replace(sectorFilter, "").trim();
  const specialty = resolveSpecialty(remaining)?.label;
  if (startsSearch) {
    if (specialty === undefined && !/^(?:praticien(?:ne)?|médecin)$/iu.test(remaining)) return;
    return {
      ...(specialty === undefined ? {} : { specialty }),
      ...(postalCode !== undefined && /^\d{5}$/u.test(postalCode) ? { postalCode } : {}),
      ...(conventionnement === undefined ? {} : { conventionnement }),
    };
  }
  if (previous === undefined) return;
  if (remaining === "" && (conventionnement !== undefined || /^\d{5}$/u.test(postalCode ?? ""))) {
    return {
      ...previous,
      ...(conventionnement === undefined ? {} : { conventionnement }),
      ...(postalCode !== undefined && /^\d{5}$/u.test(postalCode) ? { postalCode } : {}),
    };
  }
  if (previous.specialty === undefined && specialty !== undefined && remaining === input) {
    return { ...previous, specialty };
  }
  return undefined;
}

export function directoryIntent(messages: readonly ChatTurn[]): string | DirectoryFilters | undefined {
  let criteria: Criteria | undefined;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = message.content.replace(/[.!?]+$/u, "").replace(/[’]/gu, "'").replace(/\s+/gu, " ").trim();
    const request = opening.exec(text)?.[1];
    criteria = readCriteria(request ?? text, request !== undefined, criteria);
  }
  if (criteria === undefined) return;
  if (criteria.specialty === undefined) return "Quel type de praticien recherches-tu ?";
  if (criteria.postalCode === undefined) return "Dans quel code postal dois-je chercher ?";
  return { ...criteria, specialty: criteria.specialty, postalCode: criteria.postalCode };
}
