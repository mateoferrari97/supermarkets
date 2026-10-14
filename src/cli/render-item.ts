import type { OrderItem } from "../core/order-resolution/resolve-order.ts";

export function renderItem(item: OrderItem): string {
  const details = [
    item.quantity === null ? null : `x${item.quantity}`,
    item.brand ? `brand ${item.brand}` : null,
    item.terms.length > 0 ? `terms ${item.terms.join(", ")}` : null,
    item.vagueWords.length > 0 ? `vague ${item.vagueWords.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const types = item.productTypes.map(({ id, name }) => `${name} \`${id}\``).join(" o ");
  const { question } = item;
  const asked =
    question === null
      ? null
      : question.kind === "productType"
        ? `asks ${question.reason}: ${question.options.map(({ id }) => id).join(", ")}`
        : question.kind === "size"
          ? `asks size: ${question.options.join(", ")}`
          : question.kind === "term"
            ? `asks term "${question.term}"`
            : "asks what it means";
  const outcome = [types, asked].filter(Boolean).join("; ");
  return `${item.phrase}${details ? ` [${details}]` : ""} → ${outcome}`;
}
