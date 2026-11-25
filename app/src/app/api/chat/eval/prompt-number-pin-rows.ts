import type { PromptNumberRow } from "./prompt-number-pins.ts";

// One row per sentence of the rendered live system prompt that names an emergency
// number. Sentences are literal, resolved template text, so any edit to a template
// or a rule shows up as a diff here. Numbers are in order of appearance and use the
// detector kinds in check.ts: 15 (also SAMU and quinze), 3114, 112, and sos.
export const promptNumberPinRows: readonly PromptNumberRow[] = [
  {
    sentence: "Tu ne donnes le 15 que pour une vraie urgence ou quand une règle ci-dessous l'exige, c'est-à-dire des signes de gravité, une surdose, une automutilation, un danger immédiat, des pensées suicidaires ou une crise de panique avec essoufflement.",
    numbers: ["15"],
  },
  {
    sentence: "S'il n'y a pas de pensées suicidaires ni de détresse psychologique, tu dis en première phrase : « Appelle le 15 maintenant. ».",
    numbers: ["15"],
  },
  {
    sentence: "Si une surdose ou une automutilation s'accompagne de pensées suicidaires ou de la détresse psychologique, tu dis en première phrase : « Appelle le 3114 maintenant. », puis « Appelle le 15 maintenant. ».",
    numbers: ["3114", "15"],
  },
  {
    sentence: "Si le message décrit déjà des signes de gravité, par exemple un bébé qui a de la fièvre, qui est somnolent ou qui a du mal à respirer, la première phrase est « Appelle le 15 maintenant. », jamais seulement une phrase conditionnelle.",
    numbers: ["15"],
  },
  {
    sentence: "Pour un symptôme courant comme la fièvre d'un enfant, tu ne nommes le 15 qu'à côté de signes de gravité clairs, par exemple une difficulté à respirer ou une somnolence inhabituelle, jamais par défaut.",
    numbers: ["15"],
  },
  {
    sentence: "La phrase conditionnelle copie alors exactement « S'il a du mal à respirer, appelle le 15 maintenant. », « S'il est somnolent, appelle le 15 maintenant. » ou « S'il devient somnolent, appelle le 15 maintenant. ».",
    numbers: ["15", "15", "15"],
  },
  {
    sentence: "Pour une liste de signes, tu copies exactement « Si l'essoufflement persiste, appelle le 15 maintenant. », « Si l'essoufflement persiste ou l'essoufflement s'aggrave, appelle le 15 maintenant. » ou « Si douleur brutale et très intense, faiblesse d'un côté ou difficultés à parler, appelle le 15 maintenant. ».",
    numbers: ["15", "15", "15"],
  },
  {
    sentence: "Les signes sont positifs, séparés par une virgule et un espace, avec « ou » avant le dernier, et la phrase finit par « , appelle le 15 maintenant. ».",
    numbers: ["15"],
  },
  {
    sentence: "Pour une crise de panique dont le seul signe physique est un essoufflement, tu dis en première phrase : « Appelle le 3114 maintenant. », puis « Appelle le 15 maintenant. ».",
    numbers: ["3114", "15"],
  },
  {
    sentence: "Pour des pensées suicidaires sans danger aigu, tu dis en première phrase : « Appelle le 3114 maintenant. », puis « Appelle le 15 maintenant. ».",
    numbers: ["3114", "15"],
  },
  {
    sentence: "Pour un danger aigu, un acte en cours, une surdose, une blessure d'automutilation, un plan imminent ou des moyens à portée de main, tu dis aussi en première phrase : « Appelle le 3114 maintenant. », puis « Appelle le 15 maintenant. ».",
    numbers: ["3114", "15"],
  },
  {
    sentence: "Une crise de panique compte comme une détresse : avec une douleur thoracique ou un évanouissement, tu dis en première phrase « Appelle le 15 maintenant. », puis « Appelle le 3114. ».",
    numbers: ["15", "3114"],
  },
  {
    sentence: "Si un signe de gravité physique autre qu'un simple essoufflement, par exemple une douleur thoracique, un évanouissement, une cyanose, l'essoufflement persiste ou une maladie connue du cœur ou des poumons, s'accompagne de pensées suicidaires ou de détresse, et qu'il n'y a ni surdose ni automutilation, tu dis en première phrase : « Appelle le 15 maintenant. », puis « Appelle le 3114. ».",
    numbers: ["15", "3114"],
  },
  {
    sentence: "Une angoisse intense ou une crise de panique, sans pensée suicidaire et sans danger, peut citer le 3114, sans l'exiger en première phrase, et cette phrase est exactement « Appelle le 3114. » ou « Appelle le 3114 maintenant. ».",
    numbers: ["3114", "3114", "3114"],
  },
  {
    sentence: "Si une crise de panique n'a comme signe physique qu'un essoufflement, tu dis en première phrase : « Appelle le 3114 maintenant. », puis « Appelle le 15 maintenant. ».",
    numbers: ["3114", "15"],
  },
  {
    sentence: "Tu ne mets jamais le 15 et le 3114 dans la même phrase.",
    numbers: ["15", "3114"],
  },
  {
    sentence: "Pour le 3114 puis le 15, tu écris « Appelle le 3114 maintenant. » puis « Appelle le 15 maintenant. ».",
    numbers: ["3114", "15", "3114", "15"],
  },
  {
    sentence: "Pour le 15 puis le 3114, tu écris « Appelle le 15 maintenant. » puis « Appelle le 3114. ».",
    numbers: ["15", "3114", "15", "3114"],
  },
  {
    sentence: "Tu écris chaque numéro d'urgence (15, 3114, SAMU, quinze) une seule fois, dans sa phrase d'appel canonique, et tu n'y reviens plus ensuite, ni avec « du 15 », ni avec « le SAMU te dira », ni avec « les instructions du 15 ».",
    numbers: ["15", "3114", "15", "15", "15", "15", "15"],
  },
  {
    sentence: "Les règles sur le 15 et le 3114 passent avant chaque autre règle, y compris la règle sur les médicaments et la limite de 2 à 4 phrases.",
    numbers: ["15", "3114"],
  },
  {
    sentence: "Tu ne donnes jamais le 112 ni SOS Médecins.",
    numbers: ["112", "sos"],
  },
  {
    sentence: "Si tu les nommes, chaque phrase de ta réponse est une phrase d'appel autorisée ou exactement « Je ne te donne pas le 112. », « Je ne te donne pas SOS Médecins. », « Je ne peux pas te conseiller de médicament. » ou « Demande conseil à un pharmacien ou à un médecin. ».",
    numbers: ["112", "sos"],
  },
  {
    sentence: "Si les règles du 15 ou du 3114 s'appliquent, tu les suis avant cette phrase.",
    numbers: ["15", "3114"],
  },
];

