import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { stepsFrom, type StepEvent } from "../order-conversation/steps.ts";
import type { CatalogProduct } from "./catalog-product.ts";
import type { CatalogSearch } from "./catalog-search.ts";
import type { Item } from "./item.ts";
import {
  FIT_PRODUCTS_CONCURRENCY,
  matchItems,
  type FitProductsInput,
  type FitProductsLlm,
  type FitProductsOutput,
} from "./match-items.ts";

const CARNES = "Carnes y pescados";

const catalog: CatalogProduct[] = [
  ["Carbón vegetal Carbocor 4 kg.", "Carbocor", "Carbón vegetal", CARNES],
  ["Pilas de carbón/zinc Eveready tipo AA 4 u.", "Eveready", "Pilas", "Hogar"],
  ["Carbón de leña Patagonia 3 kg.", "Patagonia", "Carbón vegetal", CARNES],
  ["Morcilla copetín al vacio La Divisa 400 grs", "La Divisa", "Morcilla", CARNES],
  ["Chorizo puro de cerdo La Divisa 400 grs", "La Divisa", "Chorizo", CARNES],
  ["Cerveza rubia Quilmes 1 l.", "Quilmes", "Cerveza rubia", "Bebidas"],
  ["Cerveza roja Patagonia 730 cc.", "Patagonia", "Cerveza roja", "Bebidas"],
].map(([name, brand, tipo, department], index) => ({
  productId: String(index + 1),
  itemId: String(index + 1),
  name: name!,
  brand: brand!,
  department: department!,
  tipo: tipo!,
  price: 1000,
  inStock: true,
  sale: { kind: "packaged", size: null },
  teasers: [],
}));

const words = (text: string) => text.toLowerCase().split(/\W+/u).filter(Boolean);

const search: CatalogSearch = {
  findMatches: ({ product, brand }, limit = 30) => {
    const query = new Set(words(`${product} ${brand ?? ""}`));
    return catalog
      .filter((candidate) =>
        words(`${candidate.name} ${candidate.tipo}`).some((word) => query.has(word)),
      )
      .slice(0, limit);
  },
};

const item = (original: string, product: string, brand: string | null = null): Item => ({
  original,
  product,
  brand,
  size: { kind: "common" },
  quantity: { kind: "minimum" },
});

const fitting =
  (answers: Record<string, (input: FitProductsInput) => Partial<FitProductsOutput>>) =>
  (input: FitProductsInput): FitProductsOutput => ({
    fits: [1],
    closest: [],
    note: null,
    question: null,
    ...answers[input.item.product]?.(input),
  });

const llmOf = (answer: (input: FitProductsInput) => FitProductsOutput) => {
  const seen: FitProductsInput[] = [];
  const llm: FitProductsLlm = {
    fitProducts: (input) => {
      seen.push(input);
      return Promise.resolve(answer(input));
    },
  };
  return { llm, seen };
};

const names = (products: CatalogProduct[]) => products.map((product) => product.name);

const position = (input: FitProductsInput, name: string) =>
  input.matches.findIndex((product) => product.name === name) + 1;

describe("matchItems", () => {
  it("maps the Fits the LLM numbers back to the Item's Matches", async () => {
    const { llm, seen } = llmOf(
      fitting({
        "Carbón para asado": (input) => ({
          fits: [
            position(input, "Carbón de leña Patagonia 3 kg."),
            position(input, "Carbón vegetal Carbocor 4 kg."),
          ],
          note: "Tomé 'carbon' como carbón.",
        }),
      }),
    );
    const [match] = await matchItems([item("1 bolsa de carbon", "Carbón para asado")], {
      search,
      llm,
    });
    assert.deepEqual(names(match!.fits), [
      "Carbón de leña Patagonia 3 kg.",
      "Carbón vegetal Carbocor 4 kg.",
    ]);
    assert.equal(match!.note, "Tomé 'carbon' como carbón.");
    assert.equal(match!.question, null);
    assert.deepEqual(
      match!.matches,
      search.findMatches({ product: "Carbón para asado", brand: null }, 30),
    );
    assert.deepEqual(seen[0]!.matches, match!.matches);
  });

  it("asks with the closest Matches as Alternatives, in the order given", async () => {
    const { llm } = llmOf(
      fitting({
        "Cerveza artesanal tamarindo": (input) => ({
          fits: [],
          closest: [
            position(input, "Cerveza roja Patagonia 730 cc."),
            position(input, "Cerveza rubia Quilmes 1 l."),
          ],
          question: "No encontré cerveza de tamarindo. ¿Te sirve alguna de estas?",
        }),
      }),
    );
    const [match] = await matchItems(
      [item("una cerveza artesanal de tamarindo", "Cerveza artesanal tamarindo")],
      { search, llm },
    );
    assert.deepEqual(match!.fits, []);
    assert.deepEqual(names(match!.question?.alternatives ?? []), [
      "Cerveza roja Patagonia 730 cc.",
      "Cerveza rubia Quilmes 1 l.",
    ]);
    assert.equal(
      match!.question?.text,
      "No encontré cerveza de tamarindo. ¿Te sirve alguna de estas?",
    );
  });

  it("tells each Item's call the other products of the same words", async () => {
    const { llm, seen } = llmOf(fitting({}));
    const original = "1 y 1 chorizo morzilla la divisa";
    await matchItems(
      [
        item(original, "Chorizo parrillero", "La Divisa"),
        item(original, "Morcilla", "La Divisa"),
        item("1 bolsa de carbon", "Carbón para asado"),
      ],
      { search, llm },
    );
    assert.deepEqual(
      seen.map(({ item, alsoInThisLine }) => [item.product, alsoInThisLine]),
      [
        ["Chorizo parrillero", ["Morcilla"]],
        ["Morcilla", ["Chorizo parrillero"]],
        ["Carbón para asado", []],
      ],
    );
  });

  it(`keeps at most ${FIT_PRODUCTS_CONCURRENCY} calls in flight and returns the Items in order`, async () => {
    const items = Array.from({ length: 25 }, (_, index) => item(`cerveza ${index}`, "Cerveza"));
    let inFlight = 0;
    let most = 0;
    const llm: FitProductsLlm = {
      fitProducts: async (input) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        const index = Number(input.item.original.split(" ")[1]);
        await new Promise((resolve) => setTimeout(resolve, (25 - index) % 7));
        inFlight -= 1;
        return { fits: [1], closest: [], note: input.item.original, question: null };
      },
    };
    const matches = await matchItems(items, { search, llm });
    assert.equal(most, FIT_PRODUCTS_CONCURRENCY);
    assert.deepEqual(
      matches.map(({ note }) => note),
      items.map(({ original }) => original),
    );
  });

  it("reports a step per Item, started before its search and done when its call returns", async () => {
    const log: string[] = [];
    const watched: CatalogSearch = {
      findMatches: (searchItem, limit) => {
        log.push(`search ${searchItem.product}`);
        return search.findMatches(searchItem, limit);
      },
    };
    const llm: FitProductsLlm = {
      fitProducts: (input) => {
        log.push(`call ${input.item.product}`);
        return Promise.resolve({ fits: [1], closest: [], note: null, question: null });
      },
    };
    const onStep = ({ status, step }: StepEvent) =>
      log.push(`${status} ${step.kind === "choose-products" ? step.original : step.kind}`);
    await matchItems(
      [item("1 bolsa de carbon", "Carbón para asado"), item("birra", "Cerveza")],
      { search: watched, llm },
      stepsFrom({ onStep }),
    );
    assert.deepEqual(log, [
      "started 1 bolsa de carbon",
      "search Carbón para asado",
      "call Carbón para asado",
      "started birra",
      "search Cerveza",
      "call Cerveza",
      "done 1 bolsa de carbon",
      "done birra",
    ]);
  });

  it("fails when an Item's call fails and starts no more calls", async () => {
    const items = Array.from({ length: 15 }, (_, index) => item(`cerveza ${index}`, "Cerveza"));
    let calls = 0;
    const llm: FitProductsLlm = {
      fitProducts: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw new Error("fit-products returned an invalid answer");
      },
    };
    await assert.rejects(matchItems(items, { search, llm }), /invalid answer/);
    assert.equal(calls, FIT_PRODUCTS_CONCURRENCY);
  });

  it("passes its signal to every call and starts none once it is aborted", async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const llm: FitProductsLlm = {
      fitProducts: (_input, signal) => {
        signals.push(signal);
        return Promise.resolve({ fits: [1], closest: [], note: null, question: null });
      },
    };
    await matchItems(
      [item("birra", "Cerveza")],
      { search, llm },
      stepsFrom({ signal: controller.signal }),
    );
    assert.deepEqual(signals, [controller.signal]);
    controller.abort();
    await assert.rejects(
      matchItems(
        [item("birra", "Cerveza")],
        { search, llm },
        stepsFrom({ signal: controller.signal }),
      ),
      { name: "AbortError" },
    );
    assert.equal(signals.length, 1);
  });
});
