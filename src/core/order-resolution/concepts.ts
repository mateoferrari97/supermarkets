export type Item = {
  phrase: string;
  quantity: number | null;
  brand: string | null;
  terms: string[];
  vagueWords: string[];
};

export type SelectionPolicy = {
  ranking: "savings-first" | "cheapest-per-unit";
  brandsOnly: string[];
  brandsPreferred: string[];
  brandsExcluded: string[];
  unexpressed: string[];
};

export const DEFAULT_SELECTION_POLICY: SelectionPolicy = {
  ranking: "savings-first",
  brandsOnly: [],
  brandsPreferred: [],
  brandsExcluded: [],
  unexpressed: [],
};

export type Evidence = { product: string; productTypeId: string; productTypeName: string };
