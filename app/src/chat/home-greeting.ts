export function homeGreeting(firstName: string | undefined): string {
  const name = firstName?.trim() ?? "";
  if (name.length === 0) {
    return "Hello";
  }
  return `Hello ${name},`;
}
