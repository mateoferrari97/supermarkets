export function postalCodeFrom(text: string): string | null {
  return /\d{4}/.exec(text)?.[0] ?? null;
}
