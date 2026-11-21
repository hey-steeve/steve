# voice

## Role

`voice` connects Twilio to the voice provider and carries audio both ways.

## Does

- Connects Twilio to the voice provider.
- Grok is the first provider.
- An environment variable swaps the provider.
- Audio goes both ways.

## Does not

- Decides nothing.

## Inputs and outputs

- The input is Twilio audio. The contract is to be defined.
- The output is audio to the provider, and audio back. The contracts are to be defined.
- `voice` uses the `VoiceProvider` interface from `@steve/shared`.

## Depends on

`@steve/shared`, for the `VoiceProvider` interface. Twilio. The voice provider. Grok is the first.

## Rules

- `voice` decides nothing.
- Never diagnose.

## Demo and production

An environment variable selects the voice provider. Grok is the first. The rest is to be defined.

## Resources

- Twilio Voice
- Media Streams

## Check

`pnpm --filter @steve/voice test`

The tests are to be defined.

## Status

To do. Owner:
