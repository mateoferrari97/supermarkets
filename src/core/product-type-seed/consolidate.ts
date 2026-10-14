import { z } from "zod";
import type { TipoMapping, Vocabulary } from "../product-types/schema.ts";
import { ID_FORMAT } from "../product-types/validate.ts";
import { EXCLUDED_CANDIDATE, type Proposal } from "./proposal.ts";
import type { Part } from "./split.ts";

export const decisionSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("merge"), from: z.string(), into: z.string() }),
  z.strictObject({ op: z.literal("move"), productType: z.string(), group: z.string() }),
  z.strictObject({ op: z.literal("rename"), id: z.string(), name: z.string().min(1) }),
  z.strictObject({ op: z.literal("addGroup"), id: z.string(), name: z.string().min(1) }),
  z.strictObject({
    op: z.literal("addProductType"),
    id: z.string(),
    name: z.string().min(1),
    group: z.string(),
  }),
  z.strictObject({ op: z.literal("place"), tipo: z.string().min(1), productType: z.string() }),
  z.strictObject({ op: z.literal("exclude"), tipo: z.string().min(1), reason: z.string().min(1) }),
]);

export const decisionsSchema = z.array(decisionSchema);

export type Decision = z.infer<typeof decisionSchema>;

export type Candidate = { id: string; name: string; group: string } | typeof EXCLUDED_CANDIDATE;

export type RemainingDoubt = {
  tipo: string;
  part: string;
  products: number;
  examples: string[];
  candidates: Candidate[];
  reason: string;
};

export type SummaryTipo = { tipo: string; products: number };

export type SummaryProductType = {
  id: string;
  name: string;
  parts: string[];
  tipos: SummaryTipo[];
};

export type SummaryGroup = { id: string; name: string; productTypes: SummaryProductType[] };

export type Consolidation = {
  vocabulary: Vocabulary;
  mapping: TipoMapping;
  doubts: RemainingDoubt[];
  tree: SummaryGroup[];
  excluded: (SummaryTipo & { reason: string })[];
};

export type ConsolidationResult =
  { ok: true; consolidation: Consolidation; warnings: string[] } | { ok: false; errors: string[] };

type Placement =
  | { kind: "mapped"; productType: string }
  | { kind: "excluded"; reason: string }
  | { kind: "doubt"; candidates: string[]; reason: string };

type TipoEntry = {
  part: string;
  products: number;
  examples: string[];
  proposed: Placement;
  placement: Placement;
};

type GroupEntry = { name: string; parts: Set<string> };
type ProductTypeEntry = { name: string; groups: Set<string>; parts: Set<string> };

export function consolidate(
  parts: Part[],
  proposals: Proposal[],
  decisions: Decision[],
): ConsolidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const groups = new Map<string, GroupEntry>();
  const productTypes = new Map<string, ProductTypeEntry>();
  const tipos = new Map<string, TipoEntry>();
  const groupAliases = new Map<string, string>();
  const productTypeAliases = new Map<string, string>();

  const follow = (aliases: Map<string, string>, id: string): string => {
    let current = id;
    while (aliases.has(current)) current = aliases.get(current)!;
    return current;
  };
  const resolveGroup = (id: string) => follow(groupAliases, id);
  const resolveProductType = (id: string) => follow(productTypeAliases, id);

  const partsById = new Map(parts.map((part) => [part.id, part]));

  for (const proposal of proposals) {
    const part = partsById.get(proposal.part);
    if (!part) {
      errors.push(`proposal for unknown part "${proposal.part}"`);
      continue;
    }
    const partTipos = new Map(part.tipos.map((entry) => [entry.tipo, entry]));
    const addTipo = (tipo: string, placement: Placement) => {
      const previous = tipos.get(tipo);
      if (previous) {
        errors.push(`Tipo "${tipo}" is in parts "${previous.part}" and "${proposal.part}"`);
        return;
      }
      const info = partTipos.get(tipo);
      tipos.set(tipo, {
        part: proposal.part,
        products: info?.products ?? 0,
        examples: info?.examples ?? [],
        proposed: placement,
        placement,
      });
    };
    const keepFirstName = (
      kind: string,
      id: string,
      entry: { name: string; parts: Set<string> },
      name: string,
    ) => {
      if (entry.name !== name) {
        warnings.push(
          `${kind} "${id}" is named "${entry.name}" in part "${[...entry.parts][0]}" and "${name}" in part "${proposal.part}"; kept "${entry.name}"`,
        );
      }
      entry.parts.add(proposal.part);
    };

    for (const group of proposal.groups) {
      const existingGroup = groups.get(group.id);
      if (existingGroup) keepFirstName("Product Type Group", group.id, existingGroup, group.name);
      else groups.set(group.id, { name: group.name, parts: new Set([proposal.part]) });
      for (const productType of group.productTypes) {
        const existing = productTypes.get(productType.id);
        if (existing) {
          keepFirstName("Product Type", productType.id, existing, productType.name);
          existing.groups.add(group.id);
        } else {
          productTypes.set(productType.id, {
            name: productType.name,
            groups: new Set([group.id]),
            parts: new Set([proposal.part]),
          });
        }
        for (const tipo of productType.tipos) {
          addTipo(tipo, { kind: "mapped", productType: productType.id });
        }
      }
    }
    for (const { tipo, reason } of proposal.excluded) addTipo(tipo, { kind: "excluded", reason });
    for (const { tipo, candidates, reason } of proposal.doubts) {
      addTipo(tipo, { kind: "doubt", candidates, reason });
    }
  }

  for (const [id, productType] of productTypes) {
    const group = groups.get(id);
    if (group) {
      errors.push(
        `id "${id}" is a Product Type Group in ${partList(group.parts)} and a Product Type in ${partList(productType.parts)}; change it in one proposal`,
      );
    }
  }

  const isGroup = (id: string) => groups.has(id);
  const isProductType = (id: string) => productTypes.has(id);
  const isTaken = (id: string) =>
    id === EXCLUDED_CANDIDATE ||
    isGroup(id) ||
    isProductType(id) ||
    groupAliases.has(id) ||
    productTypeAliases.has(id);

  decisions.forEach((decision, index) => {
    const label = `decision ${index + 1} (${decision.op})`;
    const fail = (message: string) => errors.push(`${label}: ${message}`);
    const overrides = (tipo: string, entry: TipoEntry) => {
      const { proposed } = entry;
      if (proposed.kind === "doubt") return;
      const where = proposed.kind === "mapped" ? `placed in "${proposed.productType}"` : "excluded";
      warnings.push(
        `${label}: Tipo "${tipo}" was ${where} by part "${entry.part}"; the decision overrides it`,
      );
    };
    switch (decision.op) {
      case "merge": {
        if (isGroup(resolveGroup(decision.from)) && isGroup(resolveGroup(decision.into))) {
          const from = resolveGroup(decision.from);
          const into = resolveGroup(decision.into);
          if (from === into) return fail(`"${decision.from}" is already "${decision.into}"`);
          groups.get(from)!.parts.forEach((part) => groups.get(into)!.parts.add(part));
          groups.delete(from);
          groupAliases.set(from, into);
          return;
        }
        const from = resolveProductType(decision.from);
        const into = resolveProductType(decision.into);
        if (isProductType(from) && isProductType(into)) {
          if (from === into) return fail(`"${decision.from}" is already "${decision.into}"`);
          const source = productTypes.get(from)!;
          const target = productTypes.get(into)!;
          source.groups.forEach((group) => target.groups.add(group));
          source.parts.forEach((part) => target.parts.add(part));
          productTypes.delete(from);
          productTypeAliases.set(from, into);
          return;
        }
        return fail(
          `"${decision.from}" and "${decision.into}" are not two Groups or two Product Types`,
        );
      }
      case "move": {
        const productType = productTypes.get(resolveProductType(decision.productType));
        const group = resolveGroup(decision.group);
        if (!productType) return fail(`unknown Product Type "${decision.productType}"`);
        if (!isGroup(group)) return fail(`unknown Product Type Group "${decision.group}"`);
        productType.groups = new Set([group]);
        return;
      }
      case "rename": {
        const mergedInto = groupAliases.get(decision.id) ?? productTypeAliases.get(decision.id);
        if (mergedInto) {
          return fail(`"${decision.id}" was merged into "${mergedInto}"; rename "${mergedInto}"`);
        }
        const entry = groups.get(decision.id) ?? productTypes.get(decision.id);
        if (!entry) return fail(`unknown id "${decision.id}"`);
        entry.name = decision.name;
        return;
      }
      case "addGroup": {
        if (!ID_FORMAT.test(decision.id))
          return fail(`id "${decision.id}" is not a lowercase hyphenated slug`);
        if (isTaken(decision.id)) return fail(`id "${decision.id}" already exists`);
        groups.set(decision.id, { name: decision.name, parts: new Set() });
        return;
      }
      case "addProductType": {
        const group = resolveGroup(decision.group);
        if (!ID_FORMAT.test(decision.id))
          return fail(`id "${decision.id}" is not a lowercase hyphenated slug`);
        if (isTaken(decision.id)) return fail(`id "${decision.id}" already exists`);
        if (!isGroup(group)) return fail(`unknown Product Type Group "${decision.group}"`);
        productTypes.set(decision.id, {
          name: decision.name,
          groups: new Set([group]),
          parts: new Set(),
        });
        return;
      }
      case "place": {
        const entry = tipos.get(decision.tipo);
        const productType = resolveProductType(decision.productType);
        if (!entry) return fail(`unknown Tipo "${decision.tipo}"`);
        if (!isProductType(productType))
          return fail(`unknown Product Type "${decision.productType}"`);
        overrides(decision.tipo, entry);
        entry.placement = { kind: "mapped", productType };
        return;
      }
      case "exclude": {
        const entry = tipos.get(decision.tipo);
        if (!entry) return fail(`unknown Tipo "${decision.tipo}"`);
        overrides(decision.tipo, entry);
        entry.placement = { kind: "excluded", reason: decision.reason };
        return;
      }
    }
  });

  const groupOf = new Map<string, string>();
  for (const [id, productType] of productTypes) {
    const resolved = [...new Set([...productType.groups].map(resolveGroup))];
    if (resolved.length > 1) {
      errors.push(
        `Product Type "${id}" is in Groups ${resolved.map((group) => `"${group}"`).join(", ")}; merge the Groups or move the Product Type`,
      );
    } else {
      groupOf.set(id, resolved[0]!);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const mappedTipos = new Map<string, SummaryTipo[]>();
  const mapping: TipoMapping = {};
  const excluded: Consolidation["excluded"] = [];
  const doubts: RemainingDoubt[] = [];

  for (const [tipo, entry] of [...tipos].sort(([a], [b]) => compare(a, b))) {
    const { placement } = entry;
    if (placement.kind === "mapped") {
      const id = resolveProductType(placement.productType);
      mapping[tipo] = id;
      const list = mappedTipos.get(id) ?? [];
      list.push({ tipo, products: entry.products });
      mappedTipos.set(id, list);
    } else if (placement.kind === "excluded") {
      mapping[tipo] = null;
      excluded.push({ tipo, products: entry.products, reason: placement.reason });
    } else {
      const candidates = [...new Set(placement.candidates.map(resolveProductType))].map(
        (id): Candidate => {
          if (id === EXCLUDED_CANDIDATE) return EXCLUDED_CANDIDATE;
          return {
            id,
            name: productTypes.get(id)!.name,
            group: groups.get(groupOf.get(id)!)!.name,
          };
        },
      );
      if (candidates.length < 2) {
        warnings.push(
          `doubt for Tipo "${tipo}" has fewer than 2 candidates after merges; place it or add a Product Type`,
        );
      }
      doubts.push({
        tipo,
        part: entry.part,
        products: entry.products,
        examples: entry.examples,
        candidates,
        reason: placement.reason,
      });
    }
  }

  const tree: SummaryGroup[] = [...groups]
    .map(([groupId, group]) => ({
      id: groupId,
      name: group.name,
      productTypes: [...productTypes]
        .filter(([id]) => groupOf.get(id) === groupId && mappedTipos.has(id))
        .map(([id, productType]) => ({
          id,
          name: productType.name,
          parts: [...productType.parts].sort(compare),
          tipos: mappedTipos.get(id)!,
        }))
        .sort((a, b) => compare(a.name, b.name)),
    }))
    .filter((group) => group.productTypes.length > 0)
    .sort((a, b) => compare(a.name, b.name));

  const vocabulary: Vocabulary = {
    groups: tree.map((group) => ({
      id: group.id,
      name: group.name,
      productTypes: group.productTypes.map(({ id, name }) => ({ id, name })),
    })),
  };

  return { ok: true, consolidation: { vocabulary, mapping, doubts, tree, excluded }, warnings };
}

export function renderSummary(consolidation: Consolidation): string {
  const count = (items: SummaryTipo[]) => items.reduce((total, item) => total + item.products, 0);
  const lines = ["# Product Type tree", ""];
  for (const group of consolidation.tree) {
    const groupProducts = count(group.productTypes.flatMap((productType) => productType.tipos));
    lines.push(`## ${group.name} \`${group.id}\` (${groupProducts})`, "");
    for (const productType of group.productTypes) {
      lines.push(
        `- **${productType.name}** \`${productType.id}\` (${count(productType.tipos)}) [${productType.parts.join(", ")}]`,
      );
      for (const tipo of productType.tipos) lines.push(`  - ${tipo.tipo} (${tipo.products})`);
    }
    lines.push("");
  }
  lines.push(`## Excluded (${consolidation.excluded.length} Tipos)`, "");
  for (const tipo of consolidation.excluded) {
    lines.push(`- ${tipo.tipo} (${tipo.products}): ${tipo.reason}`);
  }
  lines.push("");
  return lines.join("\n");
}

function partList(parts: Set<string>): string {
  return [...parts].map((part) => `part "${part}"`).join(", ");
}

function compare(a: string, b: string): number {
  return a.localeCompare(b, "es");
}
