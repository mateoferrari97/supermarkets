import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../../core/order-matching/catalog-product.ts";
import { createInMemoryCatalogSearch } from "./in-memory-catalog-search.ts";

type Fixture = [name: string, brand: string | null, tipo: string | null, department?: string];

function snapshot(fixtures: Fixture[], outOfStock: string[] = []): CatalogProduct[] {
  return fixtures.map(([name, brand, tipo, department = "Almacén"], index) => ({
    productId: String(index + 1),
    itemId: String(index + 1),
    name,
    brand,
    department,
    tipo,
    price: 1000,
    inStock: !outOfStock.includes(name),
    sale: { kind: "packaged", size: null },
    teasers: [],
  }));
}

const names = (products: CatalogProduct[]) => products.map((product) => product.name);

const LACTEOS = "Lácteos y productos frescos";
const CARNES = "Carnes y pescados";

const catalog = snapshot(
  [
    ["Queso cremoso La Serenísima x kg", "La Serenísima", "Queso cremoso", LACTEOS],
    ["Queso reggianito Sancor rallado 150 g.", "Sancor", "Queso rallado", LACTEOS],
    ["Queso Port Salut Light La Paulina horma x kg", "La Paulina", "Queso port salut", LACTEOS],
    ["Pilas de carbón/zinc Eveready tipo AA 4 u.", "Eveready", "Pilas", "Hogar"],
    [
      "Jabón Asepxia carbón detox barra 100 g.",
      "Asepxia",
      "Jabón en barra",
      "Perfumería y farmacia",
    ],
    ["Tira de asado x kg", "Genérico", "Asado", CARNES],
    ["Vacío para asado x kg", "Genérico", "Vacío", CARNES],
    ["Carbón de leña 4 kg.", "Patagonia", "Carbón de leña", CARNES],
    ["Salame picante Cagnoli 200 g.", "Cagnoli", "Salame", CARNES],
    ["Salsa picante Tabasco 60 ml.", "Tabasco", "Salsa picante"],
    ["Chorizo picante Paladini x kg", "Paladini", "Chorizo", CARNES],
    ["Tapa de cuadril (picanha) Huella Natural x kg", "Huella Natural", "Picanha", CARNES],
    ["Picaña de cerdo Etiqueta Negra x kg", "Etiqueta Negra", "Picanha", CARNES],
    ["Queso provoleta La Serenísima 180 g.", "La Serenísima", "Queso provoleta", LACTEOS],
    ["Provoleta parrillera Wapi x kg.", "Wapi", "Provoleta", LACTEOS],
    ["Vino tinto Santa Julia malbec 750 ml.", "Santa Julia", "Vino tinto", "Bebidas"],
    ["Parrilla portátil para asado", "Genérico", "Parrilla", "Aire Libre y Ocio"],
    ["Pinza para asado acero", "Genérico", "Pinza", "Electro y tecnología"],
    ["Remera asado", "Genérico", "Remera", "Indumentaria"],
    ["Carbón activado para filtro", "Genérico", "Filtro", "Automotor"],
    ["Juego de asado de juguete", "Genérico", "Juguete", "Juguetería y Librería"],
    ["Carbón vegetal Carbocor 3 kg.", "Carbocor", "Carbón vegetal", CARNES],
  ],
  ["Carbón vegetal Carbocor 3 kg."],
);

describe("createInMemoryCatalogSearch", () => {
  const search = createInMemoryCatalogSearch(catalog);

  it("reads a misspelt variety through trigrams", () => {
    const [first] = search.findMatches({ product: "Queso porsalud light", brand: null }, 3);
    assert.equal(first?.name, "Queso Port Salut Light La Paulina horma x kg");
  });

  it("finds Carbón de leña for Carbón para asado", () => {
    const matches = names(search.findMatches({ product: "Carbón para asado", brand: null }));
    assert.ok(matches.includes("Carbón de leña 4 kg."));
  });

  it("finds a product through its tipo alone", () => {
    const tipoOnly = snapshot([
      ["Bolsa leña dura Patagonia 4 kg.", "Patagonia", "Carbón de leña"],
      ["Pilas Eveready AA 4 u.", "Eveready", "Pilas"],
    ]);
    const matches = createInMemoryCatalogSearch(tipoOnly).findMatches({
      product: "carbón",
      brand: null,
    });
    assert.deepEqual(names(matches), ["Bolsa leña dura Patagonia 4 kg."]);
  });

  it("ranks the picaña above picante products", () => {
    const matches = names(search.findMatches({ product: "Picaña", brand: null }));
    assert.equal(matches[0], "Picaña de cerdo Etiqueta Negra x kg");
    for (const picante of matches.filter((name) => /picante/i.test(name))) {
      assert.ok(matches.indexOf(picante) > 0, picante);
    }
  });

  it("keeps a picanha named apart among the Matches", () => {
    const matches = names(search.findMatches({ product: "Picaña", brand: null }));
    assert.ok(matches.includes("Tapa de cuadril (picanha) Huella Natural x kg"));
  });

  it("never filters by a brand the snapshot lacks", () => {
    const matches = names(search.findMatches({ product: "provoleta", brand: "Santa Julia" }));
    assert.ok(matches.includes("Queso provoleta La Serenísima 180 g."));
    assert.ok(matches.includes("Provoleta parrillera Wapi x kg."));
    assert.ok(
      matches.indexOf("Provoleta parrillera Wapi x kg.") <
        matches.indexOf("Vino tinto Santa Julia malbec 750 ml."),
    );
  });

  it("ranks a brand named above the same product of another brand", () => {
    const matches = names(search.findMatches({ product: "provoleta", brand: "Wapi" }));
    assert.equal(matches[0], "Provoleta parrillera Wapi x kg.");
  });

  it("leaves out products without stock and excluded departments", () => {
    const found = new Set(
      ["asado", "carbón", "parrilla", "pinza", "remera", "juguete", "filtro"].flatMap((product) =>
        names(search.findMatches({ product, brand: null }, 100)),
      ),
    );
    for (const name of [
      "Carbón vegetal Carbocor 3 kg.",
      "Parrilla portátil para asado",
      "Pinza para asado acero",
      "Remera asado",
      "Carbón activado para filtro",
      "Juego de asado de juguete",
    ]) {
      assert.ok(!found.has(name), name);
    }
    assert.ok(found.has("Tira de asado x kg"));
  });

  it("keeps catalog order on equal scores", () => {
    const twins = snapshot([
      ["Yerba mate 1 kg.", "Taragüí", "Yerba"],
      ["Yerba mate 1 kg.", "Playadito", "Yerba"],
      ["Yerba mate 1 kg.", "Rosamonte", "Yerba"],
    ]);
    const matches = createInMemoryCatalogSearch(twins).findMatches({
      product: "yerba",
      brand: null,
    });
    assert.deepEqual(
      matches.map((product) => product.productId),
      ["1", "2", "3"],
    );
  });

  it("returns at most the limit, 30 by default", () => {
    const many = snapshot(
      Array.from({ length: 40 }, (_, index): Fixture => [
        `Galletitas ${index}`,
        null,
        "Galletitas",
      ]),
    );
    const searchMany = createInMemoryCatalogSearch(many);
    assert.equal(searchMany.findMatches({ product: "galletitas", brand: null }).length, 30);
    assert.equal(searchMany.findMatches({ product: "galletitas", brand: null }, 5).length, 5);
  });

  it("returns nothing for a query without words", () => {
    assert.deepEqual(search.findMatches({ product: "¿?", brand: null }), []);
  });
});
