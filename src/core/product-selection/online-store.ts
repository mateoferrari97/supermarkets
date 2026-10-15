export type SimulationItem = { itemId: string; quantity: number };

export type SimulationRequest = {
  postalCode: string;
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

export type Delivery = "delivers" | "does-not-deliver" | "postal-code-rejected";

export type OnlineStore = {
  checkDelivery: (postalCode: string, signal: AbortSignal) => Promise<Delivery>;
  simulate: (request: SimulationRequest, signal: AbortSignal) => Promise<Simulation>;
  cartLink: (items: SimulationItem[]) => string;
};
