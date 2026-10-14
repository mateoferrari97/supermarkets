export type Measure = { dimension: "volume" | "weight"; amount: number };

export type SearchSort = "discount:desc" | "price:asc";

export type StoreProduct = {
  productId: string;
  itemId: string;
  name: string;
  brand: string | null;
  measure: Measure | null;
};

export type CandidateQuery = {
  postalCode: string;
  tipos: string[];
  brand: string | null;
  sort: SearchSort;
  limit: number;
};

export type SimulationItem = { itemId: string; quantity: number };

export type SimulatedLine = {
  itemId: string;
  quantity: number;
  available: boolean;
  total: number;
  savings: number;
  promotions: string[];
};

export type Simulation = { lines: SimulatedLine[]; total: number };

export type OnlineStore = {
  findCandidates: (query: CandidateQuery) => Promise<StoreProduct[]>;
  simulate: (postalCode: string, items: SimulationItem[]) => Promise<Simulation>;
};
