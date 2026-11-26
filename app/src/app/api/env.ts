export function envString(name: string): string | undefined {
  const value: unknown = Reflect.get(process.env, name);
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}
