export const turnSources = ["voice", "text"] as const;

export type TurnSource = (typeof turnSources)[number];

export type Turn = {
  readonly sessionId: string;
  readonly source: TurnSource;
  readonly text: string;
};

export type Handoff<Data = unknown> = {
  readonly target: string;
  readonly intent: string;
  readonly data: Data;
};

export type FeatureResult<Data = unknown> =
  | {
      readonly ok: true;
      readonly reply: string;
      readonly data: Data;
    }
  | {
      readonly ok: false;
      readonly reply: string;
    };
