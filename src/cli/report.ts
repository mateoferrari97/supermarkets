import type { Checked } from "../compose.ts";

export function fail(errors: readonly string[]): never {
  for (const error of errors) console.error(error);
  process.exit(1);
}

export function report(errors: readonly string[], success: string): void {
  if (errors.length > 0) fail(errors);
  console.log(success);
}

export function valueOf<T>(checked: Checked<T>): T {
  if (!checked.ok) fail(checked.errors);
  return checked.value;
}

export function reportChecked(checked: Checked<unknown>, success: string): void {
  report(checked.ok ? [] : checked.errors, success);
}
