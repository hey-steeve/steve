export const triageLabels = ["emergency", "consult", "self-care", "need-info"] as const;

export type TriageLabel = (typeof triageLabels)[number];

export const emergencyNumbers = ["15", "3114"] as const;

export type EmergencyNumber = (typeof emergencyNumbers)[number];

export const triageChannels = ["physical", "psychological", "both", "none"] as const;

export type TriageChannel = (typeof triageChannels)[number];

export const EMERGENCY_MIN_P = 0.8 as const;

export type CallAction = {
  readonly type: "call";
  readonly number: EmergencyNumber;
};

type CallFor<Number extends EmergencyNumber> = {
  readonly [Key in keyof CallAction]: Key extends "number" ? Number : CallAction[Key];
};

export type EmergencyCalls =
  | readonly [CallFor<"15">]
  | readonly [CallFor<"3114">]
  | readonly [CallFor<"15">, CallFor<"3114">]
  | readonly [CallFor<"3114">, CallFor<"15">];

type Offer3114 = readonly [CallFor<"3114">];

export type ClassifyResult =
  | {
      readonly label: "emergency";
      readonly probability: number;
      readonly calls: EmergencyCalls;
    }
  | {
      readonly label: "consult" | "self-care";
      readonly probability: number;
      readonly calls?: Offer3114;
    }
  | {
      readonly label: "need-info";
      readonly reason: "model";
      readonly probability: number;
      readonly calls?: Offer3114;
    }
  | {
      readonly label: "need-info";
      readonly reason: "below-threshold";
      readonly probability: number;
      readonly calls?: Offer3114;
    }
  | {
      readonly label: "need-info";
      readonly reason: "no-channel";
      readonly probability: number;
    }
  | {
      readonly label: "need-info";
      readonly reason: "timeout";
    }
  | {
      readonly label: "need-info";
      readonly reason: "http";
    }
  | {
      readonly label: "need-info";
      readonly reason: "network";
    }
  | {
      readonly label: "need-info";
      readonly reason: "malformed";
    };
