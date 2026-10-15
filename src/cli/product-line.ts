import type { CatalogProduct, PackageSize } from "../core/order-matching/catalog-product.ts";

const UNITS: Record<PackageSize["dimension"], string> = {
  volume: "ml",
  weight: "g",
  units: "u",
  length: "m",
};

export function productLine(product: CatalogProduct): string {
  const { sale } = product;
  const size =
    sale.kind === "by-weight"
      ? `by weight, step ${String(sale.saleStepKg)} kg`
      : sale.size === null
        ? "no size"
        : `${String(sale.size.amount)} ${UNITS[sale.size.dimension]}`;
  return [
    product.productId,
    product.name,
    product.brand ?? "no brand",
    size,
    product.price === null ? "no price" : `$${String(product.price)}`,
    product.inStock ? "in stock" : "out of stock",
  ].join(" | ");
}
