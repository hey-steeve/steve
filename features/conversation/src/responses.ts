import type {
  ConversationNextAction,
  RequestUnderstanding,
} from "./contracts.js";

export const conversationResponses = {
  greeting: "Bonjour, comment puis-je t'aider dans tes démarches de santé ?",
  invalidChannel:
    "Ce canal de conversation n'est pas pris en charge. Démarre une nouvelle conversation pour continuer.",
  invalidSession:
    "Je ne peux pas retrouver cette conversation. Démarre une nouvelle conversation pour continuer.",
  invalidTurn:
    "Je ne peux pas traiter ce message. Tu peux le renvoyer pour continuer.",
  empty:
    "Je n'ai pas reçu de demande. Décris ce dont tu as besoin pour que je puisse t'aider.",
  tooLong:
    "Ta demande est trop longue pour être traitée en un seul message. Envoie-la en plusieurs messages plus courts.",
  sessionNotFound:
    "Je ne retrouve pas cette conversation. Démarre une nouvelle conversation pour continuer.",
  sessionCompleted:
    "Cette conversation est terminée. Démarre une nouvelle conversation si tu as une autre demande.",
  duplicate:
    "Ce message a déjà été pris en compte. Tu peux poursuivre la conversation.",
  understandingFailure:
    "Je n'ai pas pu traiter ta demande pour le moment. Tu peux réessayer ou la reformuler.",
  understandingTimeout:
    "Le traitement de ta demande a pris trop de temps. Tu peux réessayer ou la reformuler.",
  dependencyFailure:
    "Je n'ai pas pu préparer la réponse pour le moment. Tu peux réessayer dans un instant.",
  storageFailure:
    "Je n'ai pas pu enregistrer la conversation. Réessaie dans un instant.",
  startFailure:
    "Je n'ai pas pu démarrer la conversation. Réessaie dans un instant.",
} as const;

export function responseForUnderstanding(
  understanding: RequestUnderstanding,
): {
  readonly text: string;
  readonly nextAction: ConversationNextAction;
  readonly completeAfterTriage: boolean;
} {
  switch (understanding.intent) {
    case "care_request":
      return {
        text: "J'ai compris que tu veux organiser un rendez-vous ou trouver un professionnel de santé. Je transmets ta demande pour vérifier l'orientation adaptée avant toute recherche.",
        nextAction: "handoff",
        completeAfterTriage: false,
      };
    case "document_request":
      return {
        text: "J'ai compris que ta demande concerne un document. Je transmets le contexte pour vérifier la prochaine étape sans interpréter son contenu médicalement.",
        nextAction: "handoff",
        completeAfterTriage: false,
      };
    case "general_question":
      return {
        text: "J'ai bien reçu ta question. Je transmets le contexte pour vérifier la prochaine étape sans poser de diagnostic ni donner de prescription.",
        nextAction: "handoff",
        completeAfterTriage: false,
      };
    case "unsupported":
      return {
        text: "Je n'ai pas encore assez d'informations pour orienter ta demande. Peux-tu préciser ce que tu veux organiser ou obtenir ?",
        nextAction: "handoff",
        completeAfterTriage: false,
      };
    case "end_conversation":
      return {
        text: "D'accord, la conversation est terminée. Tu peux revenir si tu as besoin d'aide pour organiser tes démarches de santé.",
        nextAction: "handoff",
        completeAfterTriage: true,
      };
    default:
      return exhaustiveUnderstanding(understanding.intent);
  }
}

function exhaustiveUnderstanding(value: never): never {
  throw new Error(`Unsupported request intent: ${String(value)}`);
}
