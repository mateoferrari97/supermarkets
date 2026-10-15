import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, PackageSize } from "../order-matching/catalog-product.ts";
import type { Candidate } from "./candidates.ts";
import { rankBySelectionPolicy, type SimulatedCandidate } from "./selection-policy.ts";

const candidate = (itemId: string, size: PackageSize | null, quantity = 1): Candidate => {
  const product: CatalogProduct = {
    productId: `p${itemId}`,
    itemId,
    name: `Producto ${itemId}`,
    brand: null,
    department: "Almacén",
    tipo: null,
    price: 1000,
    inStock: true,
    sale: { kind: "packaged", size },
    teasers: [],
  };
  return { product, quantity, measured: quantity * (size?.amount ?? 1), notes: [] };
};

const simulated = (
  itemId: string,
  total: number,
  savings = 0,
  size: PackageSize | null = { dimension: "volume", amount: 1000 },
  quantity = 1,
): SimulatedCandidate => ({ candidate: candidate(itemId, size, quantity), total, savings });

const order = (ranked: SimulatedCandidate[]) =>
  ranked.map(({ candidate }) => candidate.product.itemId);

describe("rankBySelectionPolicy", () => {
  it("puts savings before a lower price", () => {
    assert.deepEqual(
      order(rankBySelectionPolicy([simulated("1", 900), simulated("2", 1200, 100)])),
      ["2", "1"],
    );
  });

  it("compares price per unit of measure across sizes", () => {
    assert.deepEqual(
      order(
        rankBySelectionPolicy([
          simulated("1", 1000, 0, { dimension: "volume", amount: 500 }),
          simulated("2", 1800, 0, { dimension: "volume", amount: 1500 }),
          simulated("3", 2500, 0, { dimension: "volume", amount: 1000 }, 2),
        ]),
      ),
      ["2", "3", "1"],
    );
  });

  it("compares price per unit among Candidates with savings", () => {
    assert.deepEqual(
      order(
        rankBySelectionPolicy([
          simulated("1", 1000, 50, { dimension: "volume", amount: 500 }),
          simulated("2", 1500, 10, { dimension: "volume", amount: 2250 }),
        ]),
      ),
      ["2", "1"],
    );
  });

  it("breaks a tie by the lowest itemId", () => {
    assert.deepEqual(
      order(
        rankBySelectionPolicy([simulated("10", 1000), simulated("9", 1000), simulated("11", 1000)]),
      ),
      ["9", "10", "11"],
    );
  });
});
