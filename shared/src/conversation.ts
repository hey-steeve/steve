export const turnChannels = ["voice", "text"] as const;

export type TurnChannel = (typeof turnChannels)[number];

export type Turn = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly channel: TurnChannel;
  readonly text: string;
};

export type Handoff<Data = unknown> = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly target: string;
  readonly intent: string;
  readonly data: Data;
};

export type FeatureResult<Data = unknown> =
  | {
      readonly ok: true;
      readonly reply: string;
      readonly data?: Data;
    }
  | {
      readonly ok: false;
      readonly reply: string;
    };
