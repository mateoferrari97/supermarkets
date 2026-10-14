import { z } from "zod";
import { ID_FORMAT } from "../product-types/validate.ts";
import type { Part } from "./split.ts";

export const EXCLUDED_CANDIDATE = "excluded";

export const proposalSchema = z.strictObject({
  part: z.string().min(1),
  groups: z.array(
    z.strictObject({
      id: z.string(),
      name: z.string().min(1),
      productTypes: z.array(
        z.strictObject({
          id: z.string(),
          name: z.string().min(1),
          tipos: z.array(z.string().min(1)),
        }),
      ),
    }),
  ),
  excluded: z.array(z.strictObject({ tipo: z.string().min(1), reason: z.string().min(1) })),
  doubts: z.array(
    z.strictObject({
      tipo: z.string().min(1),
      candidates: z.array(z.string()).min(2),
      reason: z.string().min(1),
    }),
  ),
});

export type Proposal = z.infer<typeof proposalSchema>;

export function validateProposal(input: unknown, part: Part): string[] {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `proposal at "${issue.path.join(".")}": ${issue.message}`,
    );
  }
  const proposal = parsed.data;
  const errors: string[] = [];

  if (proposal.part !== part.id) {
    errors.push(`proposal is for part "${proposal.part}", expected "${part.id}"`);
  }

  const ids = new Set<string>();
  const productTypeIds = new Set<string>();
  const register = (id: string, owner: string) => {
    if (!ID_FORMAT.test(id)) errors.push(`${owner} id "${id}" is not a lowercase hyphenated slug`);
    if (id === EXCLUDED_CANDIDATE) errors.push(`${owner} id "${id}" is reserved for exclusion`);
    if (ids.has(id)) errors.push(`${owner} id "${id}" is used more than once`);
    ids.add(id);
  };

  const doubtCandidates = new Set(proposal.doubts.flatMap((doubt) => doubt.candidates));

  const placements = new Map<string, number>();
  const place = (tipo: string) => placements.set(tipo, (placements.get(tipo) ?? 0) + 1);

  for (const group of proposal.groups) {
    register(group.id, "Product Type Group");
    if (group.productTypes.length === 0) {
      errors.push(`Product Type Group "${group.id}" has no Product Types`);
    }
    for (const productType of group.productTypes) {
      register(productType.id, "Product Type");
      productTypeIds.add(productType.id);
      if (productType.tipos.length === 0 && !doubtCandidates.has(productType.id)) {
        errors.push(`Product Type "${productType.id}" has no Tipos and no doubt names it`);
      }
      productType.tipos.forEach(place);
    }
  }
  proposal.excluded.forEach(({ tipo }) => place(tipo));
  proposal.doubts.forEach(({ tipo }) => place(tipo));

  for (const doubt of proposal.doubts) {
    for (const candidate of doubt.candidates) {
      if (candidate !== EXCLUDED_CANDIDATE && !productTypeIds.has(candidate)) {
        errors.push(`doubt for Tipo "${doubt.tipo}" names unknown candidate "${candidate}"`);
      }
    }
  }

  const partTipos = new Set(part.tipos.map(({ tipo }) => tipo));
  for (const tipo of partTipos) {
    const times = placements.get(tipo) ?? 0;
    if (times === 0) errors.push(`Tipo "${tipo}" is missing from the proposal`);
    if (times > 1) errors.push(`Tipo "${tipo}" appears ${times} times`);
  }
  for (const tipo of placements.keys()) {
    if (!partTipos.has(tipo)) errors.push(`Tipo "${tipo}" is not in part "${part.id}"`);
  }

  return errors;
}
