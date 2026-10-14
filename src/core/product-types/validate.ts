import type { z } from "zod";
import { tipoMappingSchema, vocabularySchema } from "./schema.ts";

export const ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateProductTypes(vocabularyInput: unknown, mappingInput: unknown): string[] {
  const vocabulary = vocabularySchema.safeParse(vocabularyInput);
  const mapping = tipoMappingSchema.safeParse(mappingInput);
  const errors = [
    ...schemaErrors("vocabulary", vocabulary.error),
    ...schemaErrors("mapping", mapping.error),
  ];
  if (!vocabulary.success || !mapping.success) return errors;

  const groupIds = new Set<string>();
  const productTypeIds = new Set<string>();
  const seen = new Set<string>();

  const register = (id: string, owner: string) => {
    if (!ID_FORMAT.test(id)) errors.push(`${owner} id "${id}" is not a lowercase hyphenated slug`);
    if (seen.has(id)) errors.push(`${owner} id "${id}" is used more than once`);
    seen.add(id);
  };

  for (const group of vocabulary.data.groups) {
    register(group.id, "Product Type Group");
    groupIds.add(group.id);
    if (group.productTypes.length === 0) {
      errors.push(`Product Type Group "${group.id}" has no Product Types`);
    }
    for (const productType of group.productTypes) {
      register(productType.id, "Product Type");
      productTypeIds.add(productType.id);
    }
  }

  for (const [tipo, id] of Object.entries(mapping.data)) {
    if (id === null || productTypeIds.has(id)) continue;
    errors.push(
      groupIds.has(id)
        ? `Tipo "${tipo}" maps to Product Type Group "${id}" instead of a Product Type`
        : `Tipo "${tipo}" maps to unknown Product Type "${id}"`,
    );
  }

  return errors;
}

function schemaErrors(file: string, error: z.ZodError | undefined): string[] {
  if (!error) return [];
  return error.issues.map((issue) => `${file} at "${issue.path.join(".")}": ${issue.message}`);
}
