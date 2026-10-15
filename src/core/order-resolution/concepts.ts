export type Item = {
  phrase: string;
  quantity: number | null;
  brand: string | null;
  terms: string[];
  vagueWords: string[];
};

export type Evidence = { product: string; productTypeId: string; productTypeName: string };
