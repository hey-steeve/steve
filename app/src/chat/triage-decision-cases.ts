import {
  consultGuidance,
  needInfoGuidance,
  type EmergencyCalls,
} from "@steve/triage";
import { call15Now, call3114, call3114Now } from "../app/api/chat/emergency-templates.ts";

type Call = { readonly type: "call"; readonly number: "15" | "3114" };

const call15 = { type: "call", number: "15" } as const satisfies Call;
const offer3114 = { type: "call", number: "3114" } as const satisfies Call;

export type EmergencyReplyKind = "missing" | "partial" | "compliant" | "wrong-order";

export type EmergencyModelReply = {
  readonly name: string;
  readonly kind: EmergencyReplyKind;
  readonly model: string;
  readonly reply: string;
};

const rest = "Reste au chaud.";
const aside = "Reste calme.";
const partial15 = "Appelle le 15.";
const lead3114Then15 = `${call3114Now} ${call15Now}`;
const lead15Then3114 = `${call15Now} ${call3114}`;

function modelReply(
  name: string,
  kind: EmergencyReplyKind,
  model: string,
  reply: string,
): EmergencyModelReply {
  return { name, kind, model, reply };
}

const physicalReplies = [
  modelReply("missing", "missing", rest, `${call15Now} ${rest}`),
  modelReply(
    "partial",
    "partial",
    `${partial15} ${aside}`,
    `${call15Now} ${aside}`,
  ),
  modelReply("compliant", "compliant", `${call15Now} ${rest}`, `${call15Now} ${rest}`),
  modelReply(
    "wrong-order",
    "wrong-order",
    `${call3114Now} ${aside}`,
    `${call15Now} ${call3114Now} ${aside}`,
  ),
  modelReply(
    "exact-wrong-order",
    "wrong-order",
    `${call3114Now} ${call15Now}`,
    `${call15Now} ${call3114Now}`,
  ),
  modelReply(
    "keeps-model-3114",
    "wrong-order",
    `${call3114Now} ${rest}`,
    `${call15Now} ${call3114Now} ${rest}`,
  ),
] as const satisfies readonly EmergencyModelReply[];

const psychologicalReplies = [
  modelReply("missing", "missing", rest, `${lead3114Then15} ${rest}`),
  modelReply(
    "missing-3114",
    "missing",
    `${call15Now} ${rest}`,
    `${lead3114Then15} ${rest}`,
  ),
  modelReply(
    "partial",
    "partial",
    `${call3114Now} ${partial15} ${aside}`,
    `${lead3114Then15} ${aside}`,
  ),
  modelReply(
    "compliant",
    "compliant",
    `${lead3114Then15} ${rest}`,
    `${lead3114Then15} ${rest}`,
  ),
  modelReply(
    "wrong-order",
    "wrong-order",
    `${aside} ${call3114}`,
    `${lead3114Then15} ${aside}`,
  ),
  modelReply(
    "exact-wrong-order",
    "wrong-order",
    `${call15Now} ${call3114Now}`,
    lead3114Then15,
  ),
] as const satisfies readonly EmergencyModelReply[];

const bothNoReplies = [
  modelReply("missing", "missing", rest, `${lead15Then3114} ${rest}`),
  modelReply(
    "missing-3114",
    "missing",
    `${call15Now} ${rest}`,
    `${lead15Then3114} ${rest}`,
  ),
  modelReply(
    "partial",
    "partial",
    `${partial15} ${aside} ${call3114}`,
    `${lead15Then3114} ${aside}`,
  ),
  modelReply(
    "compliant",
    "compliant",
    `${lead15Then3114} ${rest}`,
    `${lead15Then3114} ${rest}`,
  ),
  modelReply(
    "wrong-order",
    "wrong-order",
    `${call3114Now} ${aside}`,
    `${lead15Then3114} ${aside}`,
  ),
  modelReply(
    "exact-wrong-order",
    "wrong-order",
    `${call3114Now} ${call15Now}`,
    lead15Then3114,
  ),
] as const satisfies readonly EmergencyModelReply[];

const keptReplies: readonly EmergencyModelReply[] = physicalReplies.map((row) => ({
  name: row.name,
  kind: row.kind,
  model: row.model,
  reply: row.model,
}));

export type TriageDecisionCase = {
  readonly name: string;
  readonly guidance?: string;
  readonly calls?: EmergencyCalls;
  readonly replies: readonly EmergencyModelReply[];
  readonly classify:
    | {
        readonly label: "emergency";
        readonly channel: "psychological" | "physical";
        readonly probability: number;
      }
    | {
        readonly label: "emergency";
        readonly channel: "both";
        readonly harm: "yes" | "no";
        readonly probability: number;
      }
    | {
        readonly label: "consult" | "self-care" | "need-info";
        readonly channel: "psychological" | "none";
        readonly probability: number;
      }
    | { readonly label: "no-triage" };
};

export const triageDecisionCases: readonly TriageDecisionCase[] = [
  {
    name: "emergency-psychological",
    classify: { label: "emergency", channel: "psychological", probability: 0.91 },
    calls: [offer3114, call15] satisfies EmergencyCalls,
    replies: psychologicalReplies,
  },
  {
    name: "emergency-both-yes",
    classify: { label: "emergency", channel: "both", harm: "yes", probability: 0.91 },
    calls: [offer3114, call15] satisfies EmergencyCalls,
    replies: psychologicalReplies,
  },
  {
    name: "emergency-both-no",
    classify: { label: "emergency", channel: "both", harm: "no", probability: 0.91 },
    calls: [call15, offer3114] satisfies EmergencyCalls,
    replies: bothNoReplies,
  },
  {
    name: "emergency-physical",
    classify: { label: "emergency", channel: "physical", probability: 0.91 },
    calls: [call15] satisfies EmergencyCalls,
    replies: physicalReplies,
  },
  {
    name: "consult-3114",
    classify: { label: "consult", channel: "psychological", probability: 0.74 },
    calls: [offer3114] satisfies EmergencyCalls,
    guidance: consultGuidance.text,
    replies: keptReplies,
  },
  {
    name: "consult",
    classify: { label: "consult", channel: "none", probability: 0.74 },
    guidance: consultGuidance.text,
    replies: keptReplies,
  },
  {
    name: "self-care-3114",
    classify: { label: "self-care", channel: "psychological", probability: 0.7 },
    calls: [offer3114] satisfies EmergencyCalls,
    replies: keptReplies,
  },
  {
    name: "self-care",
    classify: { label: "self-care", channel: "none", probability: 0.7 },
    replies: keptReplies,
  },
  {
    name: "need-info-3114",
    classify: { label: "need-info", channel: "psychological", probability: 0.55 },
    calls: [offer3114] satisfies EmergencyCalls,
    guidance: needInfoGuidance.text,
    replies: keptReplies,
  },
  {
    name: "need-info",
    classify: { label: "need-info", channel: "none", probability: 0.55 },
    guidance: needInfoGuidance.text,
    replies: keptReplies,
  },
  {
    name: "no-triage",
    classify: { label: "no-triage" },
    replies: keptReplies,
  },
];
