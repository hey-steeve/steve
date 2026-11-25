const providerModel = /^[^/\s]+\/[^/\s]+$/;

export function openRouterModel(configured: string | undefined, fallback: string): string {
  if (configured === undefined) {
    return fallback;
  }
  const trimmed = configured.trim();
  if (!providerModel.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
