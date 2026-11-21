export type ComposerControl =
  | { readonly kind: "send" }
  | {
      readonly kind: "dictate";
      readonly listening: boolean;
      readonly supported: boolean;
    };

export function composerControl(input: {
  readonly draft: string;
  readonly listening: boolean;
  readonly supported: boolean;
}): ComposerControl {
  if (input.draft.trim().length > 0) {
    return { kind: "send" };
  }
  return {
    kind: "dictate",
    listening: input.listening,
    supported: input.supported,
  };
}
