import type { TipoMapping } from "../product-types/schema.ts";

export type Coverage = {
  grocery: number;
  mapped: number;
  excluded: number;
  inDoubt: number;
  unreviewed: string[];
  notInSnapshot: string[];
};

export function coverage(
  groceryTipos: string[],
  mapping: TipoMapping,
  doubtTipos: string[],
): Coverage {
  const grocery = new Set(groceryTipos);
  const doubts = new Set(doubtTipos);
  const result: Coverage = {
    grocery: grocery.size,
    mapped: 0,
    excluded: 0,
    inDoubt: 0,
    unreviewed: [],
    notInSnapshot: [],
  };
  for (const tipo of grocery) {
    if (!(tipo in mapping)) {
      if (doubts.has(tipo)) result.inDoubt += 1;
      else result.unreviewed.push(tipo);
    } else if (mapping[tipo] === null) {
      result.excluded += 1;
    } else {
      result.mapped += 1;
    }
  }
  for (const tipo of Object.keys(mapping)) {
    if (!grocery.has(tipo)) result.notInSnapshot.push(tipo);
  }
  return result;
}

export function renderCoverage(result: Coverage): string {
  const lines = [
    `Grocery Tipos in the Catalog Snapshot: ${result.grocery}`,
    `Mapped: ${result.mapped}`,
    `Excluded: ${result.excluded}`,
    `In doubt: ${result.inDoubt}`,
    `Unreviewed: ${result.unreviewed.length}`,
  ];
  if (result.notInSnapshot.length > 0) {
    lines.push(`In the mapping but not in the Catalog Snapshot: ${result.notInSnapshot.length}`);
  }
  return lines.join("\n");
}
