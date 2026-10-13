import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type CatalogProduct, MAX_TIPOS_PER_PART, splitIntoParts } from "./split.ts";

const product = (overrides: Partial<CatalogProduct>): CatalogProduct => ({
  name: "Producto",
  department: "Bebidas",
  availableQuantity: 1,
  seccion: "BEBIDAS",
  familia: "GASEOSAS",
  tipo: "Gaseosa",
  measureUnit: "CM3",
  ...overrides,
});

describe("splitIntoParts", () => {
  it("leaves out non-grocery departments and products without a Tipo", () => {
    const parts = splitIntoParts([
      product({ tipo: "Gaseosa" }),
      product({ tipo: null }),
      product({ tipo: "Libro", department: "Juguetería y Librería" }),
    ]);
    assert.deepEqual(
      parts.map((part) => [part.id, part.tipos.map((tipo) => tipo.tipo)]),
      [["bebidas", ["Gaseosa"]]],
    );
  });

  it("puts each Tipo once, in the grocery department where it has most products", () => {
    const parts = splitIntoParts([
      product({ tipo: "Leche entera", department: "Lácteos y productos frescos" }),
      product({ tipo: "Leche entera", department: "Lácteos y productos frescos" }),
      product({ tipo: "Leche entera", department: "Almacén" }),
    ]);
    assert.deepEqual(
      parts.map((part) => [part.department, part.tipos.map((tipo) => tipo.tipo)]),
      [["Lácteos y productos frescos", ["Leche entera"]]],
    );
  });

  it("breaks a tie between departments by department name", () => {
    const parts = splitIntoParts([
      product({ tipo: "Yerba", department: "Desayuno y merienda" }),
      product({ tipo: "Yerba", department: "Almacén" }),
    ]);
    assert.deepEqual(
      parts.map((part) => part.department),
      ["Almacén"],
    );
  });

  it("counts only grocery products when choosing the department", () => {
    const parts = splitIntoParts([
      product({ tipo: "Carbón vegetal", department: "Aire Libre y Ocio" }),
      product({ tipo: "Carbón vegetal", department: "Aire Libre y Ocio" }),
      product({ tipo: "Carbón vegetal", department: "Almacén" }),
    ]);
    assert.deepEqual(
      parts.map((part) => [part.department, part.tipos[0]?.products]),
      [["Almacén", 1]],
    );
  });

  it("splits a department over the limit into numbered parts ordered by Sección then Tipo", () => {
    const products = Array.from({ length: MAX_TIPOS_PER_PART + 1 }, (_, index) =>
      product({
        department: "Almacén",
        tipo: `Tipo ${String(index).padStart(3, "0")}`,
        seccion: index === 0 ? "Z" : "A",
      }),
    );
    const parts = splitIntoParts(products);
    assert.deepEqual(
      parts.map((part) => [part.id, part.tipos.length]),
      [
        ["almacen-1", 111],
        ["almacen-2", 110],
      ],
    );
    assert.equal(parts[0]?.tipos[0]?.tipo, "Tipo 001");
    assert.equal(parts[1]?.tipos.at(-1)?.tipo, "Tipo 000");
  });

  it("summarizes each Tipo with counts, Familias, measure units and at most 5 examples, available first", () => {
    const products = [
      product({ name: "Sin stock", availableQuantity: 0, familia: "COLAS" }),
      ...Array.from({ length: 6 }, (_, index) =>
        product({
          name: `Con stock ${index}`,
          familia: "GASEOSAS",
          measureUnit: index === 0 ? "UNI" : "CM3",
        }),
      ),
    ];
    const [tipo] = splitIntoParts(products)[0]?.tipos ?? [];
    assert.deepEqual(tipo, {
      tipo: "Gaseosa",
      products: 7,
      availableProducts: 6,
      familias: [
        { name: "GASEOSAS", count: 6 },
        { name: "COLAS", count: 1 },
      ],
      measureUnits: [
        { name: "CM3", count: 6 },
        { name: "UNI", count: 1 },
      ],
      examples: ["Con stock 0", "Con stock 1", "Con stock 2", "Con stock 3", "Con stock 4"],
    });
  });
});
