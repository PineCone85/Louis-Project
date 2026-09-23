import type { ZodError } from "zod";

export type FieldErrors = Record<string, string>;

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error?: string; fieldErrors?: FieldErrors };

export function fieldErrorsFrom(error: ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function formOptional(formData: FormData, key: string): string | null {
  const value = formString(formData, key);
  return value.length > 0 ? value : null;
}

export function formNumber(formData: FormData, key: string): number | null {
  const value = formString(formData, key).replace(/[\s,]/g, "");
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function formList(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter((v) => v.length > 0);
}
