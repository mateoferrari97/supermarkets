export type Measure = { dimension: "volume" | "weight"; amount: number };

export type SearchSort = "discount:desc" | "price:asc";

export type Teaser = { name: string; minimumQuantity: number };

export type StoreProduct = {
  productId: string;
  itemId: string;
  name: string;
  brand: string | null;
  measure: Measure | null;
  weightStepKg: number | null;
  teasers: Teaser[];
};

export type SnapshotProduct = StoreProduct & { tipo: string };

export type CandidateQuery = {
  postalCode: string;
  tipos: string[];
  brands: string[];
  sort: SearchSort;
  limit: number;
};

export type PaymentCard = { paymentSystem: string; bin: string | null };

export type SimulationItem = { itemId: string; quantity: number };

export type SimulationRequest = {
  postalCode: string;
  card: PaymentCard | null;
  items: SimulationItem[];
};

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
  simulate: (request: SimulationRequest) => Promise<Simulation>;
};
